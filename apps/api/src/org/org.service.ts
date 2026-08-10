import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalStatus, NotificationType, Prisma, ShiftAssignmentVia } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../common/request-user.type";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RoleCode } from "../roles/role-codes";
import {
  CreateGroupDto,
  CreateSubUnitDto,
  CreateUnitDto,
  MoveEmployeesDto,
  MoveEmployeeDto,
  UpdateGroupDto,
  UpdateSubUnitDto,
  UpdateUnitDto
} from "./dto/org.dto";

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService
  ) {}

  async tree(actor?: RequestUser) {
    const groupWhere = restrictedGroupWhere(actor);
    const allowedSubUnitIds = await this.allowedSubUnitIds(actor);
    const units = await this.prisma.unit.findMany({
      orderBy: { name: "asc" },
      include: {
        subUnits: {
          where: allowedSubUnitIds ? { id: { in: allowedSubUnitIds } } : undefined,
          orderBy: { name: "asc" },
          include: {
            groups: {
              where: groupWhere,
              orderBy: { name: "asc" },
              include: groupInclude()
            }
          }
        }
      }
    });

    return units.map(unit => {
      const subUnits = unit.subUnits.map(subUnit => {
        const groups = subUnit.groups.map(group => ({
          ...group,
          employeeCount: group._count.employees
        }));
        const employeeCount = groups.reduce((sum, group) => sum + group.employeeCount, 0);
        return { ...subUnit, groups, employeeCount };
      });
      const employeeCount = subUnits.reduce((sum, subUnit) => sum + subUnit.employeeCount, 0);
      return { ...unit, subUnits, employeeCount };
    });
  }

  listUnits() {
    return this.prisma.unit.findMany({ orderBy: { name: "asc" } });
  }

  getUnit(id: string) {
    return this.prisma.unit.findUniqueOrThrow({
      where: { id },
      include: { subUnits: { include: { groups: { include: { _count: { select: { employees: true } } } } } } }
    });
  }

  async listSubUnits(unitId?: string, actor?: RequestUser) {
    const allowedSubUnitIds = await this.allowedSubUnitIds(actor);
    return this.prisma.subUnit.findMany({
      where: {
        ...(unitId ? { unitId } : {}),
        ...(allowedSubUnitIds ? { id: { in: allowedSubUnitIds } } : {})
      },
      orderBy: { name: "asc" },
      include: { unit: true, groups: { include: { _count: { select: { employees: true } } } } }
    });
  }

  async getSubUnit(id: string, actor?: RequestUser) {
    await this.ensureSubUnitAccess(id, actor);
    return this.prisma.subUnit.findUniqueOrThrow({
      where: { id },
      include: { unit: true, groups: { include: { _count: { select: { employees: true } } } } }
    });
  }

  listGroups(subUnitId?: string, actor?: RequestUser) {
    return this.prisma.group.findMany({
      where: { ...(subUnitId ? { subUnitId } : {}), ...restrictedGroupWhere(actor) },
      orderBy: { name: "asc" },
      include: {
        subUnit: { include: { unit: true } },
        ...groupInclude()
      }
    }).then(groups => groups.map(group => ({ ...group, employeeCount: group._count.employees })));
  }

  async getGroup(id: string, actor?: RequestUser) {
    await this.ensureGroupAccess(id, actor);
    return this.prisma.group.findUniqueOrThrow({
      where: { id },
      include: {
        subUnit: { include: { unit: true } },
        ...groupInclude()
      }
    }).then(group => ({ ...group, employeeCount: group._count.employees }));
  }

  async createUnit(dto: CreateUnitDto, actor: RequestUser) {
    const unit = await this.prisma.unit.create({
      data: {
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        description: dto.description?.trim() || null,
        isSouthWilaya: dto.isSouthWilaya ?? false
      }
    });
    await this.audit.record({ userId: actor.id, action: "org.units.create", entityType: "unit", entityId: unit.id, after: unit as unknown as Prisma.InputJsonValue });
    return unit;
  }

  async updateUnit(id: string, dto: UpdateUnitDto, actor: RequestUser) {
    const before = await this.prisma.unit.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Unité introuvable.");

    const updated = await this.prisma.unit.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        code: dto.code?.trim().toUpperCase(),
        description: normalizeOptionalText(dto.description),
        isSouthWilaya: dto.isSouthWilaya
      }
    });
    await this.audit.record({ userId: actor.id, action: "org.units.update", entityType: "unit", entityId: id, before: before as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue });
    return updated;
  }

  async deleteUnit(id: string, force: boolean, actor: RequestUser) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: {
        subUnits: {
          include: {
            groups: { include: { _count: { select: { employees: true } } } }
          }
        }
      }
    });
    if (!unit) throw new NotFoundException("Unité introuvable.");
    const subUnitCount = unit.subUnits.length;
    const groupCount = unit.subUnits.reduce((sum, subUnit) => sum + subUnit.groups.length, 0);
    const employeeCount = unit.subUnits.reduce((sum, subUnit) => sum + subUnit.groups.reduce((inner, group) => inner + group._count.employees, 0), 0);

    if (!force && (subUnitCount || groupCount || employeeCount)) {
      throw new BadRequestException({
        message: "Suppression refusée: unité non vide.",
        contains: { subUnitCount, groupCount, employeeCount }
      });
    }

    await this.prisma.unit.delete({ where: { id } });
    await this.audit.record({ userId: actor.id, action: "org.units.delete", entityType: "unit", entityId: id, before: unit as unknown as Prisma.InputJsonValue, metadata: { force, subUnitCount, groupCount, employeeCount } });
    return { deleted: true };
  }

  async createSubUnit(dto: CreateSubUnitDto, actor: RequestUser) {
    await this.ensureUnit(dto.unitId);
    const subUnit = await this.prisma.subUnit.create({
      data: {
        unitId: dto.unitId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isSouthWilaya: dto.isSouthWilaya ?? false,
        biotimeDepartmentCode: normalizeOptionalText(dto.biotimeDepartmentCode)
      } as any
    });
    await this.audit.record({ userId: actor.id, action: "org.sub_units.create", entityType: "sub_unit", entityId: subUnit.id, after: subUnit as unknown as Prisma.InputJsonValue });
    return subUnit;
  }

  async updateSubUnit(id: string, dto: UpdateSubUnitDto, actor: RequestUser) {
    const before = await this.prisma.subUnit.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Sous-unité introuvable.");
    if (dto.unitId) await this.ensureUnit(dto.unitId);

    const updated = await this.prisma.subUnit.update({
      where: { id },
      data: {
        unitId: dto.unitId,
        name: dto.name?.trim(),
        description: normalizeOptionalText(dto.description),
        isSouthWilaya: dto.isSouthWilaya,
        biotimeDepartmentCode: dto.biotimeDepartmentCode === undefined ? undefined : normalizeOptionalText(dto.biotimeDepartmentCode)
      } as any
    });
    await this.audit.record({ userId: actor.id, action: "org.sub_units.update", entityType: "sub_unit", entityId: id, before: before as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue });
    return updated;
  }

  async deleteSubUnit(id: string, force: boolean, actor: RequestUser) {
    const subUnit = await this.prisma.subUnit.findUnique({
      where: { id },
      include: { groups: { include: { _count: { select: { employees: true } } } } }
    });
    if (!subUnit) throw new NotFoundException("Sous-unité introuvable.");
    const groupCount = subUnit.groups.length;
    const employeeCount = subUnit.groups.reduce((sum, group) => sum + group._count.employees, 0);

    if (!force && (groupCount || employeeCount)) {
      throw new BadRequestException({
        message: "Suppression refusée: sous-unité non vide.",
        contains: { groupCount, employeeCount }
      });
    }

    await this.prisma.subUnit.delete({ where: { id } });
    await this.audit.record({ userId: actor.id, action: "org.sub_units.delete", entityType: "sub_unit", entityId: id, before: subUnit as unknown as Prisma.InputJsonValue, metadata: { force, groupCount, employeeCount } });
    return { deleted: true };
  }

  async createGroup(dto: CreateGroupDto, actor: RequestUser) {
    await this.ensureSubUnit(dto.subUnitId);
    await this.ensureSubUnitAccess(dto.subUnitId, actor);
    const approval = approvalFor(actor);
    const group = await this.prisma.group.create({
      data: {
        subUnitId: dto.subUnitId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        createdById: actor.id,
        status: approval.status,
        submittedById: approval.status === ApprovalStatus.PENDING_APPROVAL ? actor.id : null,
        submittedAt: approval.status === ApprovalStatus.PENDING_APPROVAL ? new Date() : null,
        reviewedById: approval.status === ApprovalStatus.APPROVED ? actor.id : null,
        reviewedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null
      },
      include: groupInclude()
    });
    await this.audit.record({ userId: actor.id, action: "org.groups.create", entityType: "group", entityId: group.id, after: group as unknown as Prisma.InputJsonValue });
    await this.notifyPendingGroup(group, "Création de groupe à valider");
    return { ...group, employeeCount: group._count.employees };
  }

  async updateGroup(id: string, dto: UpdateGroupDto, actor: RequestUser) {
    await this.ensureGroupAccess(id, actor);
    const before = await this.prisma.group.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Groupe introuvable.");
    if (dto.subUnitId) await this.ensureSubUnit(dto.subUnitId);
    const approval = approvalFor(actor);
    const directApproval = approval.status === ApprovalStatus.APPROVED;

    const updated = await this.prisma.group.update({
      where: { id },
      data: directApproval
        ? {
            subUnitId: dto.subUnitId,
            name: dto.name?.trim(),
            description: normalizeOptionalText(dto.description),
            status: ApprovalStatus.APPROVED,
            submittedById: null,
            submittedAt: null,
            reviewedById: actor.id,
            reviewedAt: new Date(),
            rejectionReason: null,
            pendingName: null,
            pendingDescription: null,
            pendingDeleteRequested: false
          }
        : {
            status: ApprovalStatus.PENDING_APPROVAL,
            submittedById: actor.id,
            submittedAt: new Date(),
            reviewedById: null,
            reviewedAt: null,
            rejectionReason: null,
            pendingName: dto.name?.trim() || before.pendingName,
            pendingDescription: dto.description === undefined ? before.pendingDescription : normalizeOptionalText(dto.description),
            pendingDeleteRequested: false
          },
      include: groupInclude()
    });
    await this.audit.record({ userId: actor.id, action: "org.groups.update", entityType: "group", entityId: id, before: before as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue });
    await this.notifyPendingGroup(updated, "Modification de groupe à valider");
    return { ...updated, employeeCount: updated._count.employees };
  }

  async deleteGroup(id: string, force: boolean, actor: RequestUser) {
    await this.ensureGroupAccess(id, actor);
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: groupInclude()
    });
    if (!group) throw new NotFoundException("Groupe introuvable.");
    const employeeCount = group._count.employees;
    const approval = approvalFor(actor);

    if (approval.status === ApprovalStatus.PENDING_APPROVAL) {
      const updated = await this.prisma.group.update({
        where: { id },
        data: {
          status: ApprovalStatus.PENDING_APPROVAL,
          submittedById: actor.id,
          submittedAt: new Date(),
          reviewedById: null,
          reviewedAt: null,
          rejectionReason: null,
          pendingName: null,
          pendingDescription: null,
          pendingDeleteRequested: true
        },
        include: groupInclude()
      });
      await this.audit.record({
        userId: actor.id,
        action: "org.groups.delete.request",
        entityType: "group",
        entityId: id,
        before: group as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
        metadata: { force, employeeCount } as Prisma.InputJsonValue
      });
      await this.notifyPendingGroup(updated, "Suppression de groupe à valider");
      return { ...updated, employeeCount: updated._count.employees, pendingDelete: true };
    }

    if (!force && employeeCount) {
      throw new BadRequestException({
        message: "Suppression refusée: groupe non vide.",
        contains: { employeeCount }
      });
    }

    await this.prisma.group.delete({ where: { id } });
    await this.audit.record({ userId: actor.id, action: "org.groups.delete", entityType: "group", entityId: id, before: group as unknown as Prisma.InputJsonValue, metadata: { force, employeeCount } });
    return { deleted: true };
  }

  async listGroupEmployees(groupId: string, actor?: RequestUser) {
    await this.ensureGroupAccess(groupId, actor);
    return this.prisma.employee.findMany({
      where: { groupId },
      orderBy: { fullName: "asc" },
      include: { group: { include: { subUnit: { include: { unit: true } } } } }
    });
  }

  searchEmployees(search?: string) {
    const q = search?.trim();
    return this.prisma.employee.findMany({
      where: q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { employeeCode: { contains: q, mode: "insensitive" } },
              { biotimeCode: { contains: q, mode: "insensitive" } },
              { localMatricule: { contains: q, mode: "insensitive" } }
            ]
          }
        : undefined,
      orderBy: [{ groupId: "asc" }, { fullName: "asc" }],
      take: 50,
      include: { group: { include: { subUnit: { include: { unit: true } } } } }
    });
  }

  async moveEmployee(employeeId: string, dto: MoveEmployeeDto, actor: RequestUser) {
    const before = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { group: { include: { subUnit: { include: { unit: true } } } } }
    });
    if (!before) throw new NotFoundException("Employé introuvable.");
    const targetGroupId = dto.groupId || null;
    if (before.groupId === targetGroupId) {
      return { ...before, unchanged: true, pendingApproval: false };
    }
    if (targetGroupId) await this.ensureGroupAccess(targetGroupId, actor);
    if (!targetGroupId && before.groupId) await this.ensureGroupAccess(before.groupId, actor);

    const requiresApproval = await this.requiresMembershipApproval(actor, [before.groupId, targetGroupId]);
    if (requiresApproval) {
      const change = await this.prisma.groupMembershipChange.create({
        data: {
          employeeId,
          fromGroupId: before.groupId,
          toGroupId: targetGroupId,
          status: ApprovalStatus.PENDING_APPROVAL,
          submittedById: actor.id,
          submittedAt: new Date()
        },
        include: membershipChangeInclude()
      });
      await this.audit.record({
        userId: actor.id,
        action: "org.employees.move.request",
        entityType: "group_membership_change",
        entityId: change.id,
        metadata: {
          employeeId,
          fromGroupId: before.groupId,
          toGroupId: targetGroupId
        } as Prisma.InputJsonValue
      });
      await this.notifyPendingMembership(change, "Rattachement employé à valider");
      return {
        ...before,
        pendingApproval: true,
        membershipChange: change
      };
    }

    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { groupId: targetGroupId },
      include: { group: { include: { subUnit: { include: { unit: true } } } } }
    });
    const inheritedPlanningCount = await this.inheritGroupPlanning(targetGroupId, [employeeId], actor);
    await this.audit.record({
      userId: actor.id,
      action: "org.employees.move",
      entityType: "employee",
      entityId: employeeId,
      before: { groupId: before.groupId } as Prisma.InputJsonValue,
      after: { groupId: updated.groupId, inheritedPlanningCount } as Prisma.InputJsonValue
    });
    return updated;
  }

  async moveEmployees(dto: MoveEmployeesDto, actor: RequestUser) {
    const targetGroupId = dto.groupId || null;
    if (targetGroupId) await this.ensureGroupAccess(targetGroupId, actor);
    const before = await this.prisma.employee.findMany({
      where: { id: { in: dto.employeeIds } },
      select: { id: true, groupId: true }
    });
    const changed = before.filter(row => row.groupId !== targetGroupId);
    const requiresApproval = await this.requiresMembershipApproval(actor, [
      ...changed.map(row => row.groupId),
      targetGroupId
    ]);
    if (requiresApproval) {
      const removableGroupIds = [...new Set(changed.map(row => row.groupId).filter(Boolean))] as string[];
      for (const groupId of removableGroupIds) {
        await this.ensureGroupAccess(groupId, actor);
      }
      await this.prisma.groupMembershipChange.createMany({
        data: changed.map(row => ({
          employeeId: row.id,
          fromGroupId: row.groupId,
          toGroupId: targetGroupId,
          status: ApprovalStatus.PENDING_APPROVAL,
          submittedById: actor.id,
          submittedAt: new Date()
        }))
      });
      await this.audit.record({
        userId: actor.id,
        action: "org.employees.bulk_move.request",
        entityType: "group",
        entityId: targetGroupId,
        metadata: { employeeIds: changed.map(row => row.id), before, toGroupId: targetGroupId } as Prisma.InputJsonValue
      });
      await this.notifyPendingMembershipBatch(changed.length, targetGroupId);
      return { moved: 0, requested: changed.length, groupId: targetGroupId, pendingApproval: true };
    }
    await this.prisma.employee.updateMany({
      where: { id: { in: dto.employeeIds } },
      data: { groupId: targetGroupId }
    });
    const inheritedPlanningCount = await this.inheritGroupPlanning(targetGroupId, before.map(row => row.id), actor);
    await this.audit.record({
      userId: actor.id,
      action: "org.employees.bulk_move",
      entityType: "group",
      entityId: targetGroupId,
      metadata: { employeeIds: dto.employeeIds, before, inheritedPlanningCount } as Prisma.InputJsonValue
    });
    return { moved: before.length, groupId: targetGroupId };
  }

  async approveMembershipChange(id: string, actor: RequestUser) {
    ensureApprover(actor);
    const change = await this.prisma.groupMembershipChange.findUnique({
      where: { id },
      include: membershipChangeInclude()
    });
    if (!change || change.status !== ApprovalStatus.PENDING_APPROVAL) {
      throw new NotFoundException("Demande de rattachement introuvable.");
    }

    const updated = await this.prisma.$transaction(async tx => {
      await tx.employee.update({
        where: { id: change.employeeId },
        data: { groupId: change.toGroupId }
      });
      return tx.groupMembershipChange.update({
        where: { id },
        data: {
          status: ApprovalStatus.APPROVED,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          rejectionReason: null
        },
        include: membershipChangeInclude()
      });
    });
    const inheritedPlanningCount = await this.inheritGroupPlanning(change.toGroupId, [change.employeeId], actor);
    await this.refreshMembershipGroupStatuses([change.fromGroupId, change.toGroupId]);
    await this.audit.record({
      userId: actor.id,
      action: "org.employees.move.approve",
      entityType: "group_membership_change",
      entityId: id,
      before: change as unknown as Prisma.InputJsonValue,
      after: { ...(updated as unknown as Record<string, unknown>), inheritedPlanningCount } as Prisma.InputJsonValue
    });
    await this.notifications.notify([change.submittedById], NotificationType.APPROVAL_RESULT, {
      title: "Rattachement employé approuvé",
      message: `${change.employee.fullName} est maintenant rattaché ${updated.toGroup ? `à ${updated.toGroup.subUnit.unit.name} > ${updated.toGroup.subUnit.name} > ${updated.toGroup.name}` : "hors groupe"}.`,
      entityType: "group_membership_change",
      entityId: id
    });
    return updated;
  }

  private async inheritGroupPlanning(groupId: string | null, employeeIds: string[], actor?: RequestUser) {
    if (!groupId || !employeeIds.length) return 0;

    const periodStart = currentShiftPeriodStart();
    const templates = await this.prisma.employeeShiftAssignment.findMany({
      where: {
        sourceGroupId: groupId,
        assignedVia: ShiftAssignmentVia.group,
        date: { gte: periodStart },
        status: { in: [ApprovalStatus.APPROVED, ApprovalStatus.PENDING_APPROVAL] }
      },
      select: {
        date: true,
        shiftDefinitionId: true,
        status: true,
        submissionId: true,
        submittedById: true,
        submittedAt: true,
        reviewedById: true,
        reviewedAt: true
      },
      orderBy: [{ date: "asc" }, { status: "asc" }, { updatedAt: "desc" }]
    });

    const templateByDateStatus = new Map<string, (typeof templates)[number]>();
    for (const template of templates) {
      const key = `${utcDateKey(template.date)}:${template.status}`;
      if (!templateByDateStatus.has(key)) templateByDateStatus.set(key, template);
    }

    let count = 0;
    for (const employeeId of employeeIds) {
      for (const template of templateByDateStatus.values()) {
        await this.prisma.employeeShiftAssignment.upsert({
          where: {
            employeeId_date_status: {
              employeeId,
              date: template.date,
              status: template.status
            }
          },
          update: {
            shiftDefinitionId: template.shiftDefinitionId,
            assignedVia: ShiftAssignmentVia.group,
            sourceGroupId: groupId,
            createdById: actor?.id || null,
            submissionId: template.submissionId,
            submittedById: template.submittedById,
            submittedAt: template.submittedAt,
            reviewedById: template.reviewedById,
            reviewedAt: template.reviewedAt,
            rejectionReason: null
          },
          create: {
            employeeId,
            date: template.date,
            shiftDefinitionId: template.shiftDefinitionId,
            assignedVia: ShiftAssignmentVia.group,
            sourceGroupId: groupId,
            createdById: actor?.id || null,
            submissionId: template.submissionId,
            status: template.status,
            submittedById: template.submittedById,
            submittedAt: template.submittedAt,
            reviewedById: template.reviewedById,
            reviewedAt: template.reviewedAt
          }
        });
        count += 1;
      }
    }

    return count;
  }

  async rejectMembershipChange(id: string, reason: string | undefined, actor: RequestUser) {
    ensureApprover(actor);
    const change = await this.prisma.groupMembershipChange.findUnique({
      where: { id },
      include: membershipChangeInclude()
    });
    if (!change || change.status !== ApprovalStatus.PENDING_APPROVAL) {
      throw new NotFoundException("Demande de rattachement introuvable.");
    }

    const updated = await this.prisma.groupMembershipChange.update({
      where: { id },
      data: {
        status: ApprovalStatus.REJECTED,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        rejectionReason: reason?.trim() || null
      },
      include: membershipChangeInclude()
    });
    await this.refreshMembershipGroupStatuses([change.fromGroupId, change.toGroupId]);
    await this.audit.record({
      userId: actor.id,
      action: "org.employees.move.reject",
      entityType: "group_membership_change",
      entityId: id,
      before: change as unknown as Prisma.InputJsonValue,
      after: updated as unknown as Prisma.InputJsonValue,
      metadata: { reason: reason || null } as Prisma.InputJsonValue
    });
    await this.notifications.notify([change.submittedById], NotificationType.APPROVAL_RESULT, {
      title: "Rattachement employé rejeté",
      message: `${change.employee.fullName}: ${reason?.trim() || "Motif non renseigné"}`,
      entityType: "group_membership_change",
      entityId: id
    });
    return updated;
  }

  async approveGroup(id: string, actor: RequestUser) {
    ensureApprover(actor);
    const before = await this.prisma.group.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Groupe introuvable.");
    if (before.pendingDeleteRequested) {
      const employeeCount = await this.prisma.employee.count({ where: { groupId: id } });
      await this.prisma.group.delete({ where: { id } });
      await this.audit.record({
        userId: actor.id,
        action: "org.groups.delete.approve",
        entityType: "group",
        entityId: id,
        before: before as unknown as Prisma.InputJsonValue,
        metadata: { employeeCount } as Prisma.InputJsonValue
      });
      await this.notifications.notify([before.submittedById], NotificationType.APPROVAL_RESULT, {
        title: "Suppression de groupe approuvée",
        message: `${before.name} a été supprimé.`,
        entityType: "group",
        entityId: id
      });
      return { deleted: true, id, employeeCount };
    }

    const updated = await this.prisma.group.update({
      where: { id },
      data: {
        name: before.pendingName || before.name,
        description: before.pendingDescription === null ? before.description : before.pendingDescription,
        status: ApprovalStatus.APPROVED,
        submittedById: null,
        submittedAt: null,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        rejectionReason: null,
        pendingName: null,
        pendingDescription: null,
        pendingDeleteRequested: false
      },
      include: groupInclude()
    });
    await this.audit.record({ userId: actor.id, action: "org.groups.approve", entityType: "group", entityId: id, before: before as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue });
    await this.notifications.notify([before.submittedById], NotificationType.APPROVAL_RESULT, {
      title: "Groupe approuvé",
      message: `${updated.name} est maintenant actif.`,
      entityType: "group",
      entityId: id
    });
    return { ...updated, employeeCount: updated._count.employees };
  }

  async rejectGroup(id: string, reason: string | undefined, actor: RequestUser) {
    ensureApprover(actor);
    const before = await this.prisma.group.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Groupe introuvable.");
    const updated = await this.prisma.group.update({
      where: { id },
      data: {
        status: ApprovalStatus.REJECTED,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        rejectionReason: reason?.trim() || null,
        pendingName: null,
        pendingDescription: null,
        pendingDeleteRequested: false
      },
      include: groupInclude()
    });
    await this.audit.record({ userId: actor.id, action: "org.groups.reject", entityType: "group", entityId: id, before: before as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue, metadata: { reason: reason || null } });
    await this.notifications.notify([before.submittedById], NotificationType.APPROVAL_RESULT, {
      title: "Groupe rejeté",
      message: `${before.name}: ${reason?.trim() || "Motif non renseigné"}`,
      entityType: "group",
      entityId: id
    });
    return { ...updated, employeeCount: updated._count.employees };
  }

  async departmentMappingSuggestions() {
    const [departments, subUnits] = await Promise.all([
      this.prisma.employee.groupBy({
        by: ["department"],
        where: { department: { not: null }, groupId: null },
        _count: { _all: true },
        orderBy: { department: "asc" }
      }),
      this.prisma.subUnit.findMany({ include: { unit: true }, orderBy: { name: "asc" } })
    ]);

    return departments.map(item => {
      const department = item.department || "";
      const scored = subUnits
        .map(subUnit => ({
          subUnit,
          score: similarity(normalizeName(department), normalizeName(subUnit.name))
        }))
        .filter(item => item.score >= 0.65)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3);

      return {
        department,
        employeeCount: item._count._all,
        suggestions: scored.map(({ subUnit, score }) => ({
          unitId: subUnit.unitId,
          unitName: subUnit.unit.name,
          subUnitId: subUnit.id,
          subUnitName: subUnit.name,
          score
        }))
      };
    });
  }

  private async ensureUnit(id: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) throw new NotFoundException("Unité introuvable.");
    return unit;
  }

  private async ensureSubUnit(id: string) {
    const subUnit = await this.prisma.subUnit.findUnique({ where: { id } });
    if (!subUnit) throw new NotFoundException("Sous-unité introuvable.");
    return subUnit;
  }

  private async ensureGroup(id: string) {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) throw new NotFoundException("Groupe introuvable.");
    return group;
  }

  private async ensureGroupAccess(id: string, actor?: RequestUser) {
    const group = await this.ensureGroup(id);
    await this.ensureSubUnitAccess(group.subUnitId, actor);
    if (isOwnGroupRestricted(actor) && group.createdById !== actor?.id) {
      throw new BadRequestException("Vous ne pouvez gérer que vos propres groupes.");
    }
    return group;
  }

  private async ensureSubUnitAccess(subUnitId: string, actor?: RequestUser) {
    const allowedSubUnitIds = await this.allowedSubUnitIds(actor);
    if (allowedSubUnitIds && !allowedSubUnitIds.includes(subUnitId)) {
      throw new BadRequestException("Cette sous-unité n'est pas autorisée pour votre compte.");
    }
  }

  private async allowedSubUnitIds(actor?: RequestUser) {
    if (!isOwnGroupRestricted(actor)) return null;
    const access = await this.prisma.userSubUnitAccess.findMany({
      where: { userId: actor?.id },
      select: { subUnitId: true }
    });
    return access.map(item => item.subUnitId);
  }

  private async markMembershipGroupsPending(groupIds: Array<string | null | undefined>, actor: RequestUser) {
    const ids = [...new Set(groupIds.filter(Boolean))] as string[];
    if (!ids.length) return;
    await this.prisma.group.updateMany({
      where: { id: { in: ids } },
      data: {
        status: ApprovalStatus.PENDING_APPROVAL,
        submittedById: actor.id,
        submittedAt: new Date(),
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null
      }
    });
  }

  private async refreshMembershipGroupStatuses(groupIds: Array<string | null | undefined>) {
    const ids = [...new Set(groupIds.filter(Boolean))] as string[];
    for (const groupId of ids) {
      const [group, pendingMemberships] = await Promise.all([
        this.prisma.group.findUnique({
          where: { id: groupId },
          select: { id: true, pendingName: true, pendingDescription: true, pendingDeleteRequested: true, status: true }
        }),
        this.prisma.groupMembershipChange.count({
          where: {
            status: ApprovalStatus.PENDING_APPROVAL,
            OR: [{ fromGroupId: groupId }, { toGroupId: groupId }]
          }
        })
      ]);
      if (!group || group.status !== ApprovalStatus.PENDING_APPROVAL) continue;
      if (group.pendingName || group.pendingDescription || group.pendingDeleteRequested || pendingMemberships > 0) continue;
      await this.prisma.group.update({
        where: { id: groupId },
        data: {
          status: ApprovalStatus.APPROVED,
          submittedById: null,
          submittedAt: null,
          reviewedById: null,
          reviewedAt: null,
          rejectionReason: null
        }
      });
    }
  }

  private async requiresMembershipApproval(actor: RequestUser, groupIds: Array<string | null | undefined>) {
    const approval = approvalFor(actor);
    if (approval.status === ApprovalStatus.APPROVED) return false;

    const ids = [...new Set(groupIds.filter(Boolean))] as string[];
    if (!ids.length) return false;

    const groups = await this.prisma.group.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true }
    });
    const approvedGroupIds = groups
      .filter(group => group.status === ApprovalStatus.APPROVED)
      .map(group => group.id);
    if (!approvedGroupIds.length) return false;

    const approvedPlanningCount = await this.prisma.employeeShiftAssignment.count({
      where: {
        sourceGroupId: { in: approvedGroupIds },
        status: ApprovalStatus.APPROVED
      }
    });
    return approvedPlanningCount > 0;
  }

  private async notifyPendingGroup(group: { id: string; name: string; status: ApprovalStatus; subUnit?: { name: string; unit?: { name: string } } }, title: string) {
    if (group.status !== ApprovalStatus.PENDING_APPROVAL) return;
    await this.notifications.notify(await this.notifications.adminDrhUserIds(), NotificationType.PENDING_APPROVAL, {
      title,
      message: `${group.subUnit?.unit?.name || "-"} > ${group.subUnit?.name || "-"} > ${group.name}`,
      entityType: "group",
      entityId: group.id
    });
  }

  private async notifyPendingMembership(change: any, title: string) {
    await this.notifications.notify(await this.notifications.adminDrhUserIds(), NotificationType.PENDING_APPROVAL, {
      title,
      message: `${change.employee?.fullName || "Employé"}: ${formatMembershipGroup(change.fromGroup)?.name || "sans groupe"} → ${formatMembershipGroup(change.toGroup)?.name || "hors groupe"}`,
      entityType: "group_membership_change",
      entityId: change.id
    });
  }

  private async notifyPendingMembershipBatch(count: number, targetGroupId: string | null) {
    const group = targetGroupId
      ? await this.prisma.group.findUnique({ where: { id: targetGroupId }, include: { subUnit: { include: { unit: true } } } })
      : null;
    await this.notifications.notify(await this.notifications.adminDrhUserIds(), NotificationType.PENDING_APPROVAL, {
      title: "Rattachements employés à valider",
      message: `${count} changement(s) ${group ? `vers ${group.subUnit.unit.name} > ${group.subUnit.name} > ${group.name}` : "vers hors groupe"}.`,
      entityType: "group_membership_change",
      entityId: targetGroupId
    });
  }
}

function approvalFor(actor: RequestUser) {
  const roles = new Set(actor.roles || []);
  const direct = roles.has(RoleCode.Admin) || roles.has(RoleCode.DRH);
  return { status: direct ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING_APPROVAL };
}

function ensureApprover(actor: RequestUser) {
  const roles = new Set(actor.roles || []);
  if (!roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH)) {
    throw new BadRequestException("Seul un Admin ou un DRH peut approuver/rejeter cette action.");
  }
}

function groupInclude() {
  return {
    createdBy: { select: { id: true, username: true, fullName: true } },
    submittedBy: { select: { id: true, username: true, fullName: true } },
    reviewedBy: { select: { id: true, username: true, fullName: true } },
    _count: { select: { employees: true } }
  } as const;
}

function membershipChangeInclude() {
  return {
    employee: { select: { id: true, fullName: true, employeeCode: true, biotimeCode: true, localMatricule: true, groupId: true } },
    fromGroup: { include: { subUnit: { include: { unit: true } } } },
    toGroup: { include: { subUnit: { include: { unit: true } } } },
    submittedBy: { select: { id: true, username: true, fullName: true } },
    reviewedBy: { select: { id: true, username: true, fullName: true } }
  } as const;
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

function isOwnGroupRestricted(actor?: RequestUser) {
  const roles = new Set(actor?.roles || []);
  if (roles.has(RoleCode.Admin) || roles.has(RoleCode.DRH)) return false;
  return roles.has(RoleCode.ResponsableDepartement) || roles.has(RoleCode.Supervisor);
}

function restrictedGroupWhere(actor?: RequestUser) {
  return isOwnGroupRestricted(actor) ? { createdById: actor?.id } : {};
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;

  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function currentShiftPeriodStart() {
  const startDay = Number(process.env.SHIFT_PERIOD_START_DAY || 26);
  const today = new Date();
  return today.getDate() >= startDay
    ? new Date(Date.UTC(today.getFullYear(), today.getMonth(), startDay, 0, 0, 0, 0))
    : new Date(Date.UTC(today.getFullYear(), today.getMonth() - 1, startDay, 0, 0, 0, 0));
}

function utcDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
