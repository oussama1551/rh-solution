import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ApprovalStatus, NotificationType, Prisma, ShiftAssignmentVia, ShiftType } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../common/request-user.type";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RoleCode } from "../roles/role-codes";
import { AssignShiftsDto } from "./dto/assign-shifts.dto";
import { BatchAssignShiftsDto } from "./dto/batch-assign-shifts.dto";

@Injectable()
export class ShiftPlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService
  ) {}

  definitions() {
    return this.prisma.shiftDefinition.findMany({ orderBy: { shiftType: "asc" } });
  }

  async planningState(query: { employeeId?: string; groupId?: string; period?: string }, actor?: RequestUser) {
    if (!query.employeeId && !query.groupId) {
      throw new BadRequestException("Sélectionnez un employé ou un groupe.");
    }
    if (query.groupId) await this.ensureGroupAccess(query.groupId, actor);

    const period = resolveShiftPeriod(query.period);
    const [definitions, employees] = await Promise.all([
      this.definitions(),
      query.groupId
        ? this.prisma.employee.findMany({ where: { groupId: query.groupId }, select: { id: true } })
        : this.prisma.employee.findMany({ where: { id: query.employeeId }, select: { id: true } })
    ]);

    const [assignments, statusRows] = await Promise.all([
      this.prisma.employeeShiftAssignment.findMany({
        where: {
          employeeId: { in: employees.map(employee => employee.id) },
          date: { gte: period.from, lte: period.to },
          status: { in: [ApprovalStatus.APPROVED, ApprovalStatus.PENDING_APPROVAL] }
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        include: {
          shiftDefinition: true,
          sourceGroup: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, username: true, fullName: true } },
          reviewedBy: { select: { id: true, username: true, fullName: true } }
        }
      }),
      this.prisma.employeeShiftAssignment.findMany({
      where: {
        employeeId: { in: employees.map(employee => employee.id) },
        date: { gte: period.from, lte: period.to }
      },
      include: {
        submittedBy: { select: { id: true, username: true, fullName: true } },
        reviewedBy: { select: { id: true, username: true, fullName: true } }
      }
    })
    ]);

    const assignmentsByEmployeeDate = preferredAssignmentsByEmployeeDate(assignments);
    const groupTemplateByDate = query.groupId ? preferredGroupTemplateByDate(assignments, query.groupId) : new Map();
    const days = period.days.map(date => {
      if (!query.groupId) {
        const assignment = assignmentsByEmployeeDate.get(`${query.employeeId}:${date}`);
        return {
          date,
          shiftType: assignment?.shiftDefinition.shiftType || null,
          label: assignment?.shiftDefinition.label || null,
          state: assignment ? "assigned" : "empty",
          assignedVia: assignment?.assignedVia || null,
          sourceGroupId: assignment?.sourceGroupId || null,
          sourceGroupName: assignment?.sourceGroup?.name || null,
          approvalStatus: assignment?.status || null
        };
      }

      const template = groupTemplateByDate.get(date);
      const shiftTypes = employees.map(employee => assignmentsByEmployeeDate.get(`${employee.id}:${date}`)?.shiftDefinition.shiftType || null);
      const hasConflict = template
        ? employees.some(employee => {
            const assignment = assignmentsByEmployeeDate.get(`${employee.id}:${date}`);
            return assignment && assignment.shiftDefinition.shiftType !== template.shiftDefinition.shiftType;
          })
        : false;
      if (template && !hasConflict) {
        return {
          date,
          shiftType: template.shiftDefinition.shiftType,
          label: template.shiftDefinition.label,
          state: "assigned",
          assignedVia: "group",
          sourceGroupId: query.groupId,
          sourceGroupName: template.sourceGroup?.name || null,
          approvalStatus: template.status
        };
      }
      const unique = [...new Set(shiftTypes)];
      const shiftType = unique.length === 1 ? unique[0] : null;
      const definition = definitions.find(item => item.shiftType === shiftType);

      return {
        date,
        shiftType,
        label: definition?.label || null,
        state: unique.length === 1 ? (shiftType ? "assigned" : "empty") : "mixed",
        assignedVia: shiftType ? "group" : null,
        sourceGroupId: query.groupId,
        sourceGroupName: null,
        approvalStatus: employees.some(employee => assignmentsByEmployeeDate.get(`${employee.id}:${date}`)?.status === ApprovalStatus.PENDING_APPROVAL)
          ? ApprovalStatus.PENDING_APPROVAL
          : shiftType ? ApprovalStatus.APPROVED : null
      };
    });

    return {
      target: query.groupId ? { type: "group", id: query.groupId, employeeCount: employees.length } : { type: "employee", id: query.employeeId, employeeCount: employees.length },
      period: {
        key: period.key,
        label: period.label,
        from: period.fromKey,
        to: period.toKey,
        startDay: period.startDay,
        days: period.days
      },
      definitions,
      approvalSummary: summarizePlanningApproval(statusRows),
      days
    };
  }

  async printPlanning(query: { groupId?: string; subUnitId?: string; period?: string }, actor?: RequestUser) {
    if (!query.groupId && !query.subUnitId) {
      throw new BadRequestException("Sélectionnez un groupe ou une sous-unité.");
    }
    if (query.groupId) await this.ensureGroupAccess(query.groupId, actor);

    const period = resolveShiftPeriod(query.period);
    const groupWhere: Prisma.GroupWhereInput = query.groupId
      ? { id: query.groupId }
      : { subUnitId: query.subUnitId };
    if (isOwnGroupRestricted(actor)) {
      groupWhere.createdById = actor?.id;
      if (query.subUnitId) {
        const access = await this.prisma.userSubUnitAccess.findUnique({
          where: { userId_subUnitId: { userId: actor!.id, subUnitId: query.subUnitId } },
          select: { userId: true }
        });
        if (!access) throw new BadRequestException("Cette sous-unité n'est pas autorisée pour votre compte.");
      }
    }

    const [definitions, groups] = await Promise.all([
      this.definitions(),
      this.prisma.group.findMany({
        where: groupWhere,
        orderBy: { name: "asc" },
        include: {
          subUnit: { include: { unit: true } },
          employees: {
            orderBy: { fullName: "asc" },
            select: { id: true, fullName: true, employeeCode: true, biotimeCode: true, localMatricule: true }
          }
        }
      })
    ]);
    const employeeIds = groups.flatMap(group => group.employees.map(employee => employee.id));
    const assignments = employeeIds.length
      ? await this.prisma.employeeShiftAssignment.findMany({
          where: {
            employeeId: { in: employeeIds },
            date: { gte: period.from, lte: period.to },
            status: { in: [ApprovalStatus.APPROVED, ApprovalStatus.PENDING_APPROVAL] }
          },
          include: { shiftDefinition: true },
          orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
        })
      : [];
    const assignmentByEmployeeDate = preferredAssignmentsByEmployeeDate(assignments);

    return {
      generatedAt: new Date(),
      period: {
        key: period.key,
        label: period.label,
        from: period.fromKey,
        to: period.toKey,
        days: period.days
      },
      groups: groups.map(group => ({
        id: group.id,
        name: group.name,
        unitName: group.subUnit.unit.name,
        subUnitName: group.subUnit.name,
        employees: group.employees.map(employee => ({
          id: employee.id,
          fullName: employee.fullName,
          code: employee.localMatricule || employee.biotimeCode || employee.employeeCode,
          days: period.days.map(date => {
            const assignment = assignmentByEmployeeDate.get(`${employee.id}:${date}`);
            return {
              date,
              shiftType: assignment?.shiftDefinition.shiftType || null,
              label: assignment?.shiftDefinition.label || null,
              approvalStatus: assignment?.status || null
            };
          })
        })),
        days: period.days.map(date => {
          const groupTemplateByDate = preferredGroupTemplateByDate(assignments, group.id);
          const shiftTypes = group.employees.map(employee => assignmentByEmployeeDate.get(`${employee.id}:${date}`)?.shiftDefinition.shiftType || null);
          const statuses = group.employees.map(employee => assignmentByEmployeeDate.get(`${employee.id}:${date}`)?.status || null);
          const template = groupTemplateByDate.get(date);
          const hasConflict = template
            ? group.employees.some(employee => {
                const assignment = assignmentByEmployeeDate.get(`${employee.id}:${date}`);
                return assignment && assignment.shiftDefinition.shiftType !== template.shiftDefinition.shiftType;
              })
            : false;
          if (template && !hasConflict) {
            return {
              date,
              shiftType: template.shiftDefinition.shiftType,
              label: template.shiftDefinition.label,
              state: "assigned",
              approvalStatus: template.status
            };
          }
          const unique = [...new Set(shiftTypes)];
          const shiftType = unique.length === 1 ? unique[0] : null;
          const definition = definitions.find(item => item.shiftType === shiftType);
          return {
            date,
            shiftType,
            label: definition?.label || null,
            state: unique.length === 1 ? (shiftType ? "assigned" : "empty") : "mixed",
            approvalStatus: statuses.includes(ApprovalStatus.PENDING_APPROVAL) ? ApprovalStatus.PENDING_APPROVAL : shiftType ? ApprovalStatus.APPROVED : null
          };
        })
      }))
    };
  }

  async assign(dto: AssignShiftsDto, actor?: RequestUser) {
    if (!dto.groupId && (!dto.employeeIds || dto.employeeIds.length === 0)) {
      throw new BadRequestException("Sélectionnez un groupe ou une liste d'employés.");
    }

    const definition = await this.prisma.shiftDefinition.findUnique({ where: { shiftType: dto.shiftType } });
    if (!definition) throw new NotFoundException("Définition de shift introuvable.");
    if (dto.groupId) await this.ensureGroupAccess(dto.groupId, actor);

    const employees = dto.groupId
      ? await this.prisma.employee.findMany({ where: { groupId: dto.groupId }, select: { id: true } })
      : await this.prisma.employee.findMany({ where: { id: { in: dto.employeeIds || [] } }, select: { id: true } });

    const dates = serviceDates(dto.from, dto.to, Boolean(dto.includeWeekends));
    const assignedVia: ShiftAssignmentVia = dto.groupId ? "group" : "individual";
    const sourceGroupId = dto.groupId || null;
    const approval = approvalFor(actor);
    const submissionId = approval.status === ApprovalStatus.PENDING_APPROVAL ? randomUUID() : null;
    let count = 0;

    for (const employee of employees) {
      for (const date of dates) {
        // Parse as UTC midnight (see utcMidnightFromDateKey) so the @db.Date column lands on
        // the intended calendar day regardless of the server's timezone.
        const assignmentDate = utcMidnightFromDateKey(date);
        await this.prisma.employeeShiftAssignment.upsert({
          where: {
            employeeId_date_status: {
              employeeId: employee.id,
              date: assignmentDate,
              status: approval.status
            }
          },
          update: {
            shiftDefinitionId: definition.id,
            assignedVia,
            sourceGroupId,
            createdById: actor?.id || null,
            submissionId,
            submittedById: approval.status === ApprovalStatus.PENDING_APPROVAL ? actor?.id || null : null,
            submittedAt: approval.status === ApprovalStatus.PENDING_APPROVAL ? new Date() : null,
            reviewedById: approval.status === ApprovalStatus.APPROVED ? actor?.id || null : null,
            reviewedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null,
            rejectionReason: null
          },
          create: {
            employeeId: employee.id,
            date: assignmentDate,
            shiftDefinitionId: definition.id,
            assignedVia,
            sourceGroupId,
            createdById: actor?.id || null,
            submissionId,
            status: approval.status,
            submittedById: approval.status === ApprovalStatus.PENDING_APPROVAL ? actor?.id || null : null,
            submittedAt: approval.status === ApprovalStatus.PENDING_APPROVAL ? new Date() : null,
            reviewedById: approval.status === ApprovalStatus.APPROVED ? actor?.id || null : null,
            reviewedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null
          }
        });
        count += 1;
      }
    }

    await this.audit.record({
      userId: actor?.id,
      action: "shift_assignments.bulk_upsert",
      entityType: dto.groupId ? "group" : "employee",
      entityId: dto.groupId || null,
      metadata: {
        shiftType: dto.shiftType,
        from: dto.from,
        to: dto.to,
        includeWeekends: Boolean(dto.includeWeekends),
        employeeCount: employees.length,
        assignmentCount: count,
        resolvedEmployeeIds: employees.map(employee => employee.id)
        , status: approval.status, submissionId
      } as Prisma.InputJsonValue
    });

    await this.notifyPendingPlanning(approval.status, submissionId, dto.groupId || null, employees.length, count);

    return { employeeCount: employees.length, assignmentCount: count, dates, status: approval.status, submissionId };
  }

  async batchAssign(dto: BatchAssignShiftsDto, actor?: RequestUser) {
    if (!dto.groupId && !dto.employeeId) {
      throw new BadRequestException("Sélectionnez un employé ou un groupe.");
    }
    if (dto.groupId && dto.employeeId) {
      throw new BadRequestException("Choisissez soit un employé, soit un groupe, pas les deux.");
    }
    if (!dto.entries?.length) {
      throw new BadRequestException("Aucune modification à enregistrer.");
    }
    if (dto.groupId) await this.ensureGroupAccess(dto.groupId, actor);

    const [definitions, employees] = await Promise.all([
      this.prisma.shiftDefinition.findMany(),
      dto.groupId
        ? this.prisma.employee.findMany({ where: { groupId: dto.groupId }, select: { id: true } })
        : this.prisma.employee.findMany({ where: { id: dto.employeeId }, select: { id: true } })
    ]);
    // Fail loudly instead of silently returning 200 with 0 rows written.
    // This is what turns "the calendar resets to its initial state" into a visible error,
    // revealing an empty group or a missing/unknown employeeId in the payload.
    if (!employees.length) {
      throw dto.groupId
        ? new BadRequestException("Aucun employé rattaché à ce groupe — rien à enregistrer.")
        : new BadRequestException("Employé introuvable — vérifiez l'identifiant envoyé.");
    }
    const definitionByType = new Map(definitions.map(definition => [definition.shiftType, definition]));
    const assignedVia: ShiftAssignmentVia = dto.groupId ? "group" : "individual";
    const sourceGroupId = dto.groupId || null;
    const approval = approvalFor(actor);
    const submissionId = approval.status === ApprovalStatus.PENDING_APPROVAL ? randomUUID() : null;

    const normalizedEntries = dto.entries.map(entry => ({
      date: localDateKey(new Date(`${entry.date.slice(0, 10)}T00:00:00`)),
      shiftType: entry.shiftType
    }));

    let upsertedCount = 0;
    let removedCount = 0;

    await this.prisma.$transaction(async tx => {
      for (const employee of employees) {
        for (const entry of normalizedEntries) {
          // Parse as UTC midnight. EmployeeShiftAssignment.date is a @db.Date column whose
          // rows are stored/returned as UTC midnight (e.g. 2026-08-15T00:00:00.000Z). If we
          // build the Date from a local-midnight string ("T00:00:00"), the server's TZ shifts
          // it (e.g. Europe/Paris -> 2026-08-14T22:00:00Z), so the deleteMany/upsert WHERE no
          // longer matches the stored row — clears then remove nothing and the day reverts.
          const assignmentDate = utcMidnightFromDateKey(entry.date);
          if (!entry.shiftType) {
            // "Effacer" must truly empty the cell. The read path displays a shift if a row
            // exists in EITHER APPROVED or PENDING_APPROVAL status, and the two can coexist
            // (unique key is [employeeId, date, status]). Scoping the delete to only the
            // actor's status left the other-status row behind, so the day reverted to its
            // old shift after save. Delete both statuses so the cell becomes unassigned.
            const deleted = await tx.employeeShiftAssignment.deleteMany({
              where: {
                employeeId: employee.id,
                date: assignmentDate,
                status: { in: [ApprovalStatus.APPROVED, ApprovalStatus.PENDING_APPROVAL] }
              }
            });
            removedCount += deleted.count;
            continue;
          }

          const definition = definitionByType.get(entry.shiftType as ShiftType);
          if (!definition) throw new NotFoundException(`Définition de shift introuvable: ${entry.shiftType}`);

          await tx.employeeShiftAssignment.upsert({
            where: {
              employeeId_date_status: {
                employeeId: employee.id,
                date: assignmentDate,
                status: approval.status
              }
            },
            update: {
              shiftDefinitionId: definition.id,
              assignedVia,
              sourceGroupId,
              createdById: actor?.id || null,
              submissionId,
              submittedById: approval.status === ApprovalStatus.PENDING_APPROVAL ? actor?.id || null : null,
              submittedAt: approval.status === ApprovalStatus.PENDING_APPROVAL ? new Date() : null,
              reviewedById: approval.status === ApprovalStatus.APPROVED ? actor?.id || null : null,
              reviewedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null,
              rejectionReason: null
            },
            create: {
              employeeId: employee.id,
              date: assignmentDate,
              shiftDefinitionId: definition.id,
              assignedVia,
              sourceGroupId,
              createdById: actor?.id || null,
              submissionId,
              status: approval.status,
              submittedById: approval.status === ApprovalStatus.PENDING_APPROVAL ? actor?.id || null : null,
              submittedAt: approval.status === ApprovalStatus.PENDING_APPROVAL ? new Date() : null,
              reviewedById: approval.status === ApprovalStatus.APPROVED ? actor?.id || null : null,
              reviewedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null
            }
          });
          upsertedCount += 1;
        }
      }
    });

    await this.audit.record({
      userId: actor?.id,
      action: "shift_assignments.batch_upsert",
      entityType: dto.groupId ? "group" : "employee",
      entityId: dto.groupId || dto.employeeId || null,
      metadata: {
        employeeCount: employees.length,
        dayCount: normalizedEntries.length,
        upsertedCount,
        removedCount,
        entries: normalizedEntries,
        status: approval.status,
        submissionId,
        resolvedEmployeeIds: employees.map(employee => employee.id)
      } as Prisma.InputJsonValue
    });

    await this.notifyPendingPlanning(approval.status, submissionId, dto.groupId || null, employees.length, upsertedCount);

    return {
      employeeCount: employees.length,
      dayCount: normalizedEntries.length,
      upsertedCount,
      removedCount,
      assignmentCount: upsertedCount,
      status: approval.status,
      submissionId
    };
  }

  employeeAssignments(employeeId: string, month?: string) {
    const range = month ? monthRange(month) : null;
    return this.prisma.employeeShiftAssignment.findMany({
      where: {
        employeeId,
        status: ApprovalStatus.APPROVED,
        date: range ? { gte: range.from, lte: range.to } : undefined
      },
      orderBy: { date: "desc" },
      include: {
        shiftDefinition: true,
        sourceGroup: { select: { id: true, name: true } },
        createdBy: { select: { id: true, username: true, fullName: true } }
      },
      take: range ? undefined : 30
    });
  }

  async pendingApprovals() {
    const [groups, assignments, memberships] = await Promise.all([
      this.prisma.group.findMany({
        where: { status: ApprovalStatus.PENDING_APPROVAL },
        orderBy: { submittedAt: "asc" },
        include: {
          submittedBy: { select: { id: true, username: true, fullName: true } },
          reviewedBy: { select: { id: true, username: true, fullName: true } },
          subUnit: { include: { unit: true } },
          _count: { select: { employees: true } }
        }
      }),
      this.prisma.employeeShiftAssignment.findMany({
        where: { status: ApprovalStatus.PENDING_APPROVAL },
        orderBy: [{ submittedAt: "asc" }, { date: "asc" }],
        include: {
          submittedBy: { select: { id: true, username: true, fullName: true } },
          shiftDefinition: true,
          sourceGroup: { include: { subUnit: { include: { unit: true } } } },
          employee: { select: { id: true, fullName: true, biotimeCode: true, localMatricule: true, employeeCode: true } }
        }
      }),
      this.prisma.groupMembershipChange.findMany({
        where: { status: ApprovalStatus.PENDING_APPROVAL },
        orderBy: { submittedAt: "asc" },
        include: {
          employee: { select: { id: true, fullName: true, biotimeCode: true, localMatricule: true, employeeCode: true } },
          fromGroup: { include: { subUnit: { include: { unit: true } } } },
          toGroup: { include: { subUnit: { include: { unit: true } } } },
          submittedBy: { select: { id: true, username: true, fullName: true } }
        }
      })
    ]);

    const assignmentGroups = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const key = assignment.submissionId || assignment.id;
      assignmentGroups.set(key, [...(assignmentGroups.get(key) || []), assignment]);
    }

    return {
      groups: groups.map(group => ({
        id: group.id,
        type: "group" as const,
        name: group.name,
        status: group.status,
        submittedAt: group.submittedAt,
        submittedBy: group.submittedBy,
        reviewedAt: group.reviewedAt,
        reviewedBy: group.reviewedBy,
        rejectionReason: group.rejectionReason,
        pendingName: group.pendingName,
        pendingDescription: group.pendingDescription,
        pendingDeleteRequested: group.pendingDeleteRequested,
        pendingAction: group.pendingDeleteRequested ? "DELETE" : group.pendingName || group.pendingDescription ? "UPDATE" : "CREATE",
        unitName: group.subUnit.unit.name,
        subUnitName: group.subUnit.name,
        employeeCount: group._count.employees
      })),
      plannings: [...assignmentGroups.entries()].map(([submissionId, rows]) => ({
        id: submissionId,
        type: "planning" as const,
        status: ApprovalStatus.PENDING_APPROVAL,
        submittedAt: rows[0].submittedAt,
        submittedBy: rows[0].submittedBy,
        group: rows[0].sourceGroup ? {
          id: rows[0].sourceGroup.id,
          name: rows[0].sourceGroup.name,
          subUnitName: rows[0].sourceGroup.subUnit.name,
          unitName: rows[0].sourceGroup.subUnit.unit.name
        } : null,
        employeeCount: new Set(rows.map(row => row.employeeId)).size,
        dayCount: new Set(rows.map(row => localDateKey(row.date))).size,
        preview: rows.slice(0, 20).map(row => ({
          date: localDateKey(row.date),
          employeeName: row.employee.fullName,
          employeeCode: row.employee.localMatricule || row.employee.biotimeCode || row.employee.employeeCode,
          shiftType: row.shiftDefinition.shiftType,
          shiftLabel: row.shiftDefinition.label
        }))
      })),
      memberships: memberships.map(change => ({
        id: change.id,
        type: "membership" as const,
        status: change.status,
        submittedAt: change.submittedAt,
        submittedBy: change.submittedBy,
        employee: {
          id: change.employee.id,
          fullName: change.employee.fullName,
          code: change.employee.localMatricule || change.employee.biotimeCode || change.employee.employeeCode
        },
        fromGroup: formatMembershipGroup(change.fromGroup),
        toGroup: formatMembershipGroup(change.toGroup),
        action: change.toGroupId && change.fromGroupId ? "MOVE" : change.toGroupId ? "ADD" : "REMOVE"
      }))
    };
  }

  async approvePlanning(submissionId: string, actor: RequestUser) {
    ensureApprover(actor);
    const pending = await this.prisma.employeeShiftAssignment.findMany({
      where: { submissionId, status: ApprovalStatus.PENDING_APPROVAL },
      select: { id: true, employeeId: true, date: true, submittedById: true, sourceGroup: { select: { name: true } } }
    });
    if (!pending.length) throw new NotFoundException("Soumission de planning introuvable.");

    await this.prisma.$transaction(async tx => {
      for (const row of pending) {
        await tx.employeeShiftAssignment.deleteMany({
          where: {
            employeeId: row.employeeId,
            date: row.date,
            status: ApprovalStatus.APPROVED
          }
        });
      }

      await tx.employeeShiftAssignment.updateMany({
        where: { submissionId, status: ApprovalStatus.PENDING_APPROVAL },
        data: {
          status: ApprovalStatus.APPROVED,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          rejectionReason: null
        }
      });
    });

    await this.audit.record({
      userId: actor.id,
      action: "shift_assignments.approve",
      entityType: "shift_assignment_submission",
      metadata: { submissionId, assignmentCount: pending.length } as Prisma.InputJsonValue
    });

    await this.notifications.notify(uniqueSubmitters(pending), NotificationType.APPROVAL_RESULT, {
      title: "Planning approuvé",
      message: `Votre planning ${pending[0].sourceGroup?.name ? `du groupe ${pending[0].sourceGroup.name}` : ""} est maintenant actif (${pending.length} ligne(s)).`,
      entityType: "shift_assignment_submission",
      entityId: submissionId
    });

    return { approved: true, submissionId, assignmentCount: pending.length };
  }

  async rejectPlanning(submissionId: string, reason: string | undefined, actor: RequestUser) {
    ensureApprover(actor);
    const pending = await this.prisma.employeeShiftAssignment.findMany({
      where: { submissionId, status: ApprovalStatus.PENDING_APPROVAL },
      select: { id: true, employeeId: true, date: true, submittedById: true, sourceGroup: { select: { name: true } } }
    });
    if (!pending.length) throw new NotFoundException("Soumission de planning introuvable.");

    await this.prisma.$transaction(async tx => {
      for (const row of pending) {
        await tx.employeeShiftAssignment.deleteMany({
          where: {
            employeeId: row.employeeId,
            date: row.date,
            status: ApprovalStatus.REJECTED,
            id: { not: row.id }
          }
        });
      }

      await tx.employeeShiftAssignment.updateMany({
        where: { submissionId, status: ApprovalStatus.PENDING_APPROVAL },
        data: {
          status: ApprovalStatus.REJECTED,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          rejectionReason: reason?.trim() || null
        }
      });
    });

    await this.audit.record({
      userId: actor.id,
      action: "shift_assignments.reject",
      entityType: "shift_assignment_submission",
      metadata: { submissionId, assignmentCount: pending.length, reason: reason || null } as Prisma.InputJsonValue
    });

    await this.notifications.notify(uniqueSubmitters(pending), NotificationType.APPROVAL_RESULT, {
      title: "Planning rejeté",
      message: `${pending[0].sourceGroup?.name ? `Groupe ${pending[0].sourceGroup.name}: ` : ""}${reason?.trim() || "Motif non renseigné"}`,
      entityType: "shift_assignment_submission",
      entityId: submissionId
    });

    return { rejected: true, submissionId, assignmentCount: pending.length };
  }

  private async notifyPendingPlanning(status: ApprovalStatus, submissionId: string | null, groupId: string | null, employeeCount: number, assignmentCount: number) {
    if (status !== ApprovalStatus.PENDING_APPROVAL || !submissionId) return;
    const group = groupId
      ? await this.prisma.group.findUnique({ where: { id: groupId }, include: { subUnit: { include: { unit: true } } } })
      : null;
    await this.notifications.notify(await this.notifications.adminDrhUserIds(), NotificationType.PENDING_APPROVAL, {
      title: "Planning à valider",
      message: group
        ? `${group.subUnit?.unit?.name || "-"} > ${group.subUnit?.name || "-"} > ${group.name}: ${employeeCount} employé(s), ${assignmentCount} affectation(s).`
        : `${employeeCount} employé(s), ${assignmentCount} affectation(s).`,
      entityType: "shift_assignment_submission",
      entityId: submissionId
    });
  }

  private async ensureGroupAccess(groupId: string, actor?: RequestUser) {
    if (!isOwnGroupRestricted(actor)) return;
    const group = await this.prisma.group.findUnique({ where: { id: groupId }, select: { id: true, createdById: true, subUnitId: true } });
    if (!group) throw new NotFoundException("Groupe introuvable.");
    const access = await this.prisma.userSubUnitAccess.findUnique({
      where: { userId_subUnitId: { userId: actor!.id, subUnitId: group.subUnitId } },
      select: { userId: true }
    });
    if (!access) throw new BadRequestException("Cette sous-unité n'est pas autorisée pour votre compte.");
    if (group.createdById !== actor?.id) {
      throw new BadRequestException("Vous ne pouvez gérer que vos propres groupes.");
    }
  }
}

function approvalFor(actor?: RequestUser) {
  const roles = new Set(actor?.roles || []);
  const isDirectApproval = roles.has(RoleCode.Admin) || roles.has(RoleCode.DRH) || roles.has(RoleCode.GRH) || roles.has(RoleCode.HR);
  return { status: isDirectApproval ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING_APPROVAL };
}

function ensureApprover(actor: RequestUser) {
  const roles = new Set(actor.roles || []);
  if (!roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH)) {
    throw new BadRequestException("Seul un Admin ou un DRH peut approuver/rejeter une soumission.");
  }
}

function isOwnGroupRestricted(actor?: RequestUser) {
  const roles = new Set(actor?.roles || []);
  if (roles.has(RoleCode.Admin) || roles.has(RoleCode.DRH)) return false;
  return roles.has(RoleCode.ResponsableDepartement) || roles.has(RoleCode.Supervisor);
}

function summarizePlanningApproval(rows: Array<{
  status: ApprovalStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  submittedBy: { id: string; username: string; fullName: string | null } | null;
  reviewedBy: { id: string; username: string; fullName: string | null } | null;
}>) {
  const byStatus = (status: ApprovalStatus) => rows.filter(row => row.status === status);
  const latest = (items: typeof rows, field: "submittedAt" | "reviewedAt") => [...items]
    .filter(item => item[field])
    .sort((left, right) => Number(right[field]) - Number(left[field]))[0] || null;

  const approvedRows = byStatus(ApprovalStatus.APPROVED);
  const pendingRows = byStatus(ApprovalStatus.PENDING_APPROVAL);
  const rejectedRows = byStatus(ApprovalStatus.REJECTED);
  const draftRows = byStatus(ApprovalStatus.DRAFT);
  const latestApproved = latest(approvedRows, "reviewedAt");
  const latestPending = latest(pendingRows, "submittedAt");
  const latestRejected = latest(rejectedRows, "reviewedAt");

  return {
    status: pendingRows.length
      ? (approvedRows.length ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING_APPROVAL)
      : rejectedRows.length && !approvedRows.length
        ? ApprovalStatus.REJECTED
        : approvedRows.length
          ? ApprovalStatus.APPROVED
          : draftRows.length
            ? ApprovalStatus.DRAFT
            : ApprovalStatus.DRAFT,
    approvedCount: approvedRows.length,
    pendingCount: pendingRows.length,
    rejectedCount: rejectedRows.length,
    draftCount: draftRows.length,
    latestApprovedAt: latestApproved?.reviewedAt || null,
    latestApprovedBy: latestApproved?.reviewedBy || null,
    latestPendingAt: latestPending?.submittedAt || null,
    latestPendingBy: latestPending?.submittedBy || null,
    latestRejectedAt: latestRejected?.reviewedAt || null,
    latestRejectedBy: latestRejected?.reviewedBy || null,
    latestRejectionReason: latestRejected?.rejectionReason || null
  };
}

function preferredAssignmentsByEmployeeDate<T extends { employeeId: string; date: Date; status: ApprovalStatus }>(assignments: T[]) {
  const map = new Map<string, T>();
  for (const assignment of assignments) {
    // assignment.date comes from a @db.Date column as UTC midnight; read it with UTC getters
    // so the key matches the calendar day written by utcMidnightFromDateKey.
    const key = `${assignment.employeeId}:${utcDateKey(assignment.date)}`;
    const current = map.get(key);
    if (!current || assignment.status === ApprovalStatus.PENDING_APPROVAL || current.status !== ApprovalStatus.PENDING_APPROVAL) {
      map.set(key, assignment);
    }
  }
  return map;
}

function preferredGroupTemplateByDate<T extends {
  date: Date;
  status: ApprovalStatus;
  assignedVia: ShiftAssignmentVia;
  sourceGroupId: string | null;
}>(assignments: T[], groupId: string) {
  const map = new Map<string, T>();
  for (const assignment of assignments) {
    if (assignment.assignedVia !== ShiftAssignmentVia.group || assignment.sourceGroupId !== groupId) continue;
    const key = utcDateKey(assignment.date);
    const current = map.get(key);
    if (!current || assignment.status === ApprovalStatus.PENDING_APPROVAL || current.status !== ApprovalStatus.PENDING_APPROVAL) {
      map.set(key, assignment);
    }
  }
  return map;
}

function serviceDates(from: string, to: string, includeWeekends: boolean) {
  const dates: string[] = [];
  let cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (includeWeekends || (day !== 0 && day !== 6)) {
      dates.push(localDateKey(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function monthRange(month: string) {
  const from = new Date(`${month}-01T00:00:00`);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
  return { from, to };
}

function resolveShiftPeriod(periodKey?: string) {
  const startDay = Number(process.env.SHIFT_PERIOD_START_DAY || 26);
  const key = periodKey || currentPeriodKey(startDay);
  const [year, month] = key.split("-").map(Number);
  const to = new Date(year, month - 1, startDay - 1, 23, 59, 59, 999);
  const from = new Date(year, month - 2, startDay, 0, 0, 0, 0);
  const days = serviceDates(localDateKey(from), localDateKey(to), true);

  return {
    key,
    from,
    to,
    fromKey: localDateKey(from),
    toKey: localDateKey(to),
    startDay,
    days,
    label: `Période : ${formatPeriodDate(from)} - ${formatPeriodDate(to)}`
  };
}

function currentPeriodKey(startDay: number) {
  const today = new Date();
  const labelDate = today.getDate() >= startDay
    ? new Date(today.getFullYear(), today.getMonth() + 1, 1)
    : new Date(today.getFullYear(), today.getMonth(), 1);
  return `${labelDate.getFullYear()}-${String(labelDate.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriodDate(date: Date) {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatMembershipGroup(group: any) {
  if (!group) return null;
  return {
    id: group.id,
    name: group.name,
    subUnitName: group.subUnit.name,
    unitName: group.subUnit.unit.name
  };
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "YYYY-MM-DD" read from a Date using UTC getters. Use for @db.Date column values, which
 *  Prisma returns as UTC midnight — using local getters drifts them by the server TZ. */
function utcDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Build a Date that, when persisted to / compared against a Prisma `@db.Date` column,
 * lands on exactly the requested calendar day. Existing rows are stored as UTC midnight
 * (e.g. `2026-08-15T00:00:00.000Z`), so the key must be parsed as UTC. Parsing a local
 * string such as `new Date("2026-08-15T00:00:00")` shifts the instant by the server TZ
 * (Europe/Paris -> `2026-08-14T22:00:00Z`) and breaks both upsert WHERE and deleteMany
 * filters — clears silently remove 0 rows and the calendar reverts to its old value.
 */
function utcMidnightFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function uniqueSubmitters(rows: Array<{ submittedById: string | null }>) {
  return [...new Set(rows.map(row => row.submittedById).filter(Boolean))] as string[];
}
