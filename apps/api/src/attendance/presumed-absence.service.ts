import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { AttendanceSummaryStatus, PresumedAbsenceCaseType, PresumedAbsenceStatus, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { employeeScopeWhere } from "../common/employee-scope";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "../reports/reports.service";
import { RoleCode } from "../roles/role-codes";

const BASIS = "no_punch_heuristic";
const PLANNED_ABSENCE_BASIS = "daily_absence_report";
const REST_PRESENCE_BASIS = "rest_schedule_with_punch";

@Injectable()
export class PresumedAbsenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reports: ReportsService
  ) {}

  @Cron(process.env.PRESUMED_ABSENCE_CRON || "0 9 * * *")
  async scheduledDetection() {
    const result = await this.detectForToday();
    if (result.created > 0) {
      console.log(`Vérifications de présence: ${result.created} nouvelle(s) détection(s) sur ${result.checked} cas vérifié(s).`);
    }
  }

  async detectForToday(reference = new Date(), targetDate?: string) {
    const dateKey = targetDate || localDateKey(reference);
    const todayKey = localDateKey(reference);
    const targetDay = startOfLocalDay(new Date(`${dateKey}T00:00:00`));
    await this.autoRejectInactivePending(targetDay);
    const yesterday = addDays(targetDay, -1);
    const nowMinutes = reference.getHours() * 60 + reference.getMinutes();
    const plannedResult = await this.importPlannedAbsences(dateKey, reference);
    const unexpectedResult = await this.detectUnexpectedPresenceOnRest(dateKey, reference);

    if (dateKey !== todayKey) {
      return {
        skipped: false,
        heuristicSkippedReason: "not_today",
        checked: plannedResult.checked + unexpectedResult.checked,
        created: plannedResult.created + unexpectedResult.created,
        plannedChecked: plannedResult.checked,
        plannedCreated: plannedResult.created,
        heuristicChecked: 0,
        heuristicCreated: 0,
        unexpectedPresenceChecked: unexpectedResult.checked,
        unexpectedPresenceCreated: unexpectedResult.created
      };
    }

    if (targetDay.getDay() === 5) {
      return {
        skipped: false,
        heuristicSkippedReason: "friday",
        checked: plannedResult.checked + unexpectedResult.checked,
        created: plannedResult.created + unexpectedResult.created,
        plannedChecked: plannedResult.checked,
        plannedCreated: plannedResult.created,
        heuristicChecked: 0,
        heuristicCreated: 0,
        unexpectedPresenceChecked: unexpectedResult.checked,
        unexpectedPresenceCreated: unexpectedResult.created
      };
    }

    if (nowMinutes <= 8 * 60 + 30) {
      return {
        skipped: false,
        heuristicSkippedReason: "before_threshold",
        checked: plannedResult.checked + unexpectedResult.checked,
        created: plannedResult.created + unexpectedResult.created,
        plannedChecked: plannedResult.checked,
        plannedCreated: plannedResult.created,
        heuristicChecked: 0,
        heuristicCreated: 0,
        unexpectedPresenceChecked: unexpectedResult.checked,
        unexpectedPresenceCreated: unexpectedResult.created
      };
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        status: "ACTIVE",
        plannedShiftAssignments: {
          none: {
            date: targetDay
          }
        }
      },
      select: { id: true, employeeCode: true, biotimeCode: true, localMatricule: true }
    });
    const justifiedEmployeeIds = await this.justifiedEmployeeIds(employees.map(employee => employee.id), targetDay);

    let created = 0;
    const from = yesterday;
    const to = new Date(reference);

    for (const employee of employees) {
      if (justifiedEmployeeIds.has(employee.id)) continue;

      const punchCount = await this.countIdentityPunches(employee, from, to);

      if (punchCount > 0) continue;

      const result = await this.prisma.presumedAbsence.upsert({
        where: { employeeId_date_caseType: { employeeId: employee.id, date: targetDay, caseType: PresumedAbsenceCaseType.PRESUMED_ABSENCE } },
        update: {},
        create: {
          employeeId: employee.id,
          date: targetDay,
          detectedAt: reference,
          basis: BASIS,
          caseType: PresumedAbsenceCaseType.PRESUMED_ABSENCE,
          message: "Aucun pointage réel trouvé pour ce jour.",
          status: PresumedAbsenceStatus.PENDING_REVIEW
        }
      });
      if (result.detectedAt.getTime() === reference.getTime()) {
        created += 1;
      }
    }

    return {
      skipped: false,
      checked: plannedResult.checked + unexpectedResult.checked + employees.length,
      created: plannedResult.created + unexpectedResult.created + created,
      plannedChecked: plannedResult.checked,
      plannedCreated: plannedResult.created,
      heuristicChecked: employees.length,
      heuristicCreated: created,
      unexpectedPresenceChecked: unexpectedResult.checked,
      unexpectedPresenceCreated: unexpectedResult.created
    };
  }

  private async importPlannedAbsences(date: string, detectedAt: Date) {
    const report = await this.reports.dailyAbsences({ date });
    const absences = report.rows.filter(row => row.status === "ABSENT");
    let created = 0;

    for (const row of absences) {
      const result = await this.prisma.presumedAbsence.upsert({
        where: { employeeId_date_caseType: { employeeId: row.employee.id, date: startOfLocalDay(new Date(`${row.date}T00:00:00`)), caseType: PresumedAbsenceCaseType.PRESUMED_ABSENCE } },
        update: {},
        create: {
          employeeId: row.employee.id,
          date: startOfLocalDay(new Date(`${row.date}T00:00:00`)),
          detectedAt,
          basis: PLANNED_ABSENCE_BASIS,
          caseType: PresumedAbsenceCaseType.PRESUMED_ABSENCE,
          message: "Absence détectée depuis Absences / planning, sans pointage réel pour ce jour.",
          status: PresumedAbsenceStatus.PENDING_REVIEW
        }
      });
      if (result.detectedAt.getTime() === detectedAt.getTime()) {
        created += 1;
      }
    }

    return { checked: absences.length, created };
  }

  async detectUnexpectedPresenceOnRest(date: string, detectedAt = new Date()) {
    const targetDay = startOfLocalDay(new Date(`${date}T00:00:00`));
    const punchDayStart = new Date(`${date}T00:00:00`);
    const punchDayEnd = new Date(`${date}T00:00:00`);
    punchDayEnd.setDate(punchDayEnd.getDate() + 1);
    const assignments = await this.prisma.employeeShiftAssignment.findMany({
      where: {
        date: targetDay,
        status: "APPROVED",
        shiftDefinition: { shiftType: "REPOS" },
        employee: { status: "ACTIVE" }
      },
      select: {
        employee: { select: { id: true, employeeCode: true, biotimeCode: true, localMatricule: true } }
      }
    });
    let created = 0;

    for (const assignment of assignments) {
      const punches = await this.prisma.attendancePunch.findMany({
        where: {
          punchTime: { gte: punchDayStart, lt: punchDayEnd },
          OR: identityPunchClauses(assignment.employee)
        },
        select: { punchTime: true },
        orderBy: { punchTime: "asc" }
      });
      if (punches.length === 0) continue;

      const times = punches.map(punch => formatLocalTime(punch.punchTime)).join(", ");
      const result = await this.prisma.presumedAbsence.upsert({
        where: {
          employeeId_date_caseType: {
            employeeId: assignment.employee.id,
            date: targetDay,
            caseType: PresumedAbsenceCaseType.UNEXPECTED_PRESENCE_ON_REST
          }
        },
        update: { message: `Présence inattendue sur jour de repos. Pointage(s) réel(s): ${times}.` },
        create: {
          employeeId: assignment.employee.id,
          date: targetDay,
          detectedAt,
          basis: REST_PRESENCE_BASIS,
          caseType: PresumedAbsenceCaseType.UNEXPECTED_PRESENCE_ON_REST,
          message: `Présence inattendue sur jour de repos. Pointage(s) réel(s): ${times}.`,
          status: PresumedAbsenceStatus.PENDING_REVIEW
        }
      });
      if (result.detectedAt.getTime() === detectedAt.getTime()) created += 1;
    }

    return { checked: assignments.length, created };
  }

  async list(filters: { status?: string; caseType?: string; date?: string; dateFrom?: string; dateTo?: string; search?: string }, actor?: RequestUser) {
    const status = filters.status && filters.status !== "ALL" ? filters.status as PresumedAbsenceStatus : undefined;
    const caseType = filters.caseType && filters.caseType !== "ALL" ? filters.caseType as PresumedAbsenceCaseType : undefined;
    const dateRange = presumedAbsenceDateRange(filters);
    await this.autoRejectRange(dateRange);
    const search = filters.search?.trim();
    const employeeScope = employeeScopeWhere(actor);

    const where: Prisma.PresumedAbsenceWhereInput = {
      status,
      caseType,
      date: dateRange,
      employee: {
        ...employeeScope,
        ...(search ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { employeeCode: { contains: search, mode: "insensitive" } },
            { biotimeCode: { contains: search, mode: "insensitive" } },
            { localMatricule: { contains: search, mode: "insensitive" } }
          ]
        } : {})
      }
    };

    const rows = await this.prisma.presumedAbsence.findMany({
      where,
      orderBy: [{ date: "desc" }, { detectedAt: "desc" }],
      include: {
        employee: {
          select: {
            id: true,
            zktecoId: true,
            biotimeCode: true,
            localMatricule: true,
            employeeCode: true,
            fullName: true,
            department: true,
            status: true
          }
        },
        reviewedBy: { select: { id: true, username: true, fullName: true } }
      }
    });

    const visible = [];
    for (const row of rows) {
      if (row.caseType === PresumedAbsenceCaseType.PRESUMED_ABSENCE && await this.isJustified(row.employeeId, row.date)) continue;
      if (row.caseType === PresumedAbsenceCaseType.PRESUMED_ABSENCE && row.status === PresumedAbsenceStatus.PENDING_REVIEW) {
        const presenceEvidence = await this.countPresenceEvidence(row.employee, row.date, row.basis);
        if (presenceEvidence > 0) continue;
      }
      visible.push(row);
    }
    return visible;
  }

  async confirm(id: string, actor: RequestUser) {
    this.ensureReviewer(actor);
    return this.review(id, actor, PresumedAbsenceStatus.CONFIRMED);
  }

  async reject(id: string, actor: RequestUser, note?: string) {
    this.ensureReviewer(actor);
    return this.review(id, actor, PresumedAbsenceStatus.REJECTED, note);
  }

  private async review(id: string, actor: RequestUser, status: "CONFIRMED" | "REJECTED", note?: string) {
    const before = await this.prisma.presumedAbsence.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException("Cas de présence introuvable.");
    }

    const updated = await this.prisma.presumedAbsence.update({
      where: { id },
      data: {
        status,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            biotimeCode: true,
            localMatricule: true,
            fullName: true,
            department: true,
            status: true
          }
        },
        reviewedBy: { select: { id: true, username: true, fullName: true } }
      }
    });

    await this.audit.record({
      userId: actor.id,
      action: status === PresumedAbsenceStatus.CONFIRMED ? "presumed_absence.confirm" : "presumed_absence.reject",
      entityType: "presumed_absence",
      entityId: id,
      before: before as unknown as Prisma.InputJsonValue,
      after: updated as unknown as Prisma.InputJsonValue,
      metadata: { note: note?.trim() || null }
    });

    return updated;
  }

  private ensureReviewer(actor: RequestUser) {
    const roles = new Set(actor.roles || []);
    if (!roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH) && !roles.has(RoleCode.GRH)) {
      throw new ForbiddenException("Seuls Admin, DRH et GRH peuvent valider les cas de présence.");
    }
  }

  private countIdentityPunches(
    employee: { id: string; employeeCode?: string | null; biotimeCode?: string | null; localMatricule?: string | null },
    from: Date,
    to: Date
  ) {
    return this.prisma.attendancePunch.count({
      where: {
        punchTime: { gte: from, lte: to },
        OR: identityPunchClauses(employee)
      }
    });
  }

  private async countPresenceEvidence(
    employee: { id: string; employeeCode?: string | null; biotimeCode?: string | null; localMatricule?: string | null },
    date: Date,
    basis: string
  ) {
    const from = basis === BASIS ? addDays(date, -1) : date;
    const to = addDays(date, 1);
    const [punchCount, summaryCount] = await Promise.all([
      this.countIdentityPunches(employee, from, to),
      this.prisma.attendanceSummaryRecord.count({
        where: {
          employeeId: employee.id,
          workDate: { gte: date, lt: to },
          status: { in: [AttendanceSummaryStatus.PRESENT, AttendanceSummaryStatus.INCOMPLETE] }
        }
      })
    ]);
    return punchCount + summaryCount;
  }

  private async autoRejectRange(dateRange?: Prisma.DateTimeFilter | Date) {
    if (!dateRange) {
      await this.autoRejectInactivePending();
      await this.autoRejectJustifiedPending();
      await this.autoRejectPunchedPending();
      return;
    }
    if (dateRange instanceof Date) {
      await this.autoRejectInactivePending(dateRange);
      await this.autoRejectJustifiedPending(dateRange);
      await this.autoRejectPunchedPending(dateRange);
      return;
    }
    if (!dateRange.gte || !dateRange.lte || !(dateRange.gte instanceof Date) || !(dateRange.lte instanceof Date)) return;
    for (let cursor = new Date(dateRange.gte); cursor <= dateRange.lte; cursor = addDays(cursor, 1)) {
      await this.autoRejectInactivePending(cursor);
      await this.autoRejectJustifiedPending(cursor);
      await this.autoRejectPunchedPending(cursor);
    }
  }

  private async autoRejectInactivePending(date?: Date) {
    const rows = await this.prisma.presumedAbsence.findMany({
      where: {
        status: PresumedAbsenceStatus.PENDING_REVIEW,
        caseType: PresumedAbsenceCaseType.PRESUMED_ABSENCE,
        ...(date ? { date } : {}),
        employee: { status: { not: "ACTIVE" } }
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            status: true,
            employeeCode: true,
            biotimeCode: true,
            localMatricule: true
          }
        }
      }
    });

    for (const row of rows) {
      const updated = await this.prisma.presumedAbsence.update({
        where: { id: row.id },
        data: {
          status: PresumedAbsenceStatus.REJECTED,
          reviewedAt: new Date(),
          reviewNote: "Rejet automatique: employé non actif/démissionné."
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              biotimeCode: true,
              localMatricule: true,
              fullName: true,
              department: true,
              status: true
            }
          },
          reviewedBy: { select: { id: true, username: true, fullName: true } }
        }
      });
      await this.audit.record({
        action: "presumed_absence.auto_reject_inactive",
        entityType: "presumed_absence",
        entityId: row.id,
        before: row as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
        metadata: { employeeStatus: row.employee.status }
      });
    }

    return rows.length;
  }

  private async autoRejectJustifiedPending(date?: Date) {
    const rows = await this.prisma.presumedAbsence.findMany({
      where: {
        status: PresumedAbsenceStatus.PENDING_REVIEW,
        caseType: PresumedAbsenceCaseType.PRESUMED_ABSENCE,
        ...(date ? { date } : {})
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            biotimeCode: true,
            localMatricule: true,
            fullName: true,
            department: true,
            status: true
          }
        }
      }
    });

    let rejected = 0;
    for (const row of rows) {
      if (!(await this.isJustified(row.employeeId, row.date))) continue;
      const updated = await this.prisma.presumedAbsence.update({
        where: { id: row.id },
        data: {
          status: PresumedAbsenceStatus.REJECTED,
          reviewedAt: new Date(),
          reviewNote: "Rejet automatique: jour couvert par maladie ou congé approuvé."
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              biotimeCode: true,
              localMatricule: true,
              fullName: true,
              department: true,
              status: true
            }
          },
          reviewedBy: { select: { id: true, username: true, fullName: true } }
        }
      });
      rejected += 1;
      await this.audit.record({
        action: "presumed_absence.auto_reject_justified",
        entityType: "presumed_absence",
        entityId: row.id,
        before: row as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
        metadata: { reason: "approved_sick_or_leave" }
      });
    }

    return rejected;
  }

  private async autoRejectPunchedPending(date?: Date) {
    const rows = await this.prisma.presumedAbsence.findMany({
      where: {
        status: PresumedAbsenceStatus.PENDING_REVIEW,
        caseType: PresumedAbsenceCaseType.PRESUMED_ABSENCE,
        ...(date ? { date } : {})
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            biotimeCode: true,
            localMatricule: true,
            fullName: true,
            department: true,
            status: true
          }
        }
      }
    });

    let rejected = 0;
    for (const row of rows) {
      const presenceEvidence = await this.countPresenceEvidence(row.employee, row.date, row.basis);
      if (presenceEvidence === 0) continue;

      const updated = await this.prisma.presumedAbsence.update({
        where: { id: row.id },
        data: {
          status: PresumedAbsenceStatus.REJECTED,
          reviewedAt: new Date(),
          reviewNote: "Rejet automatique: pointage réel trouvé pour ce jour."
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              biotimeCode: true,
              localMatricule: true,
              fullName: true,
              department: true,
              status: true
            }
          },
          reviewedBy: { select: { id: true, username: true, fullName: true } }
        }
      });
      rejected += 1;
      await this.audit.record({
        action: "presumed_absence.auto_reject_punched",
        entityType: "presumed_absence",
        entityId: row.id,
        before: row as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
        metadata: { presenceEvidence, basis: row.basis }
      });
    }

    return rejected;
  }

  private async isJustified(employeeId: string, date: Date) {
    const count = await Promise.all([
      this.prisma.sickLeaveDeclaration.count({
        where: { employeeId, dateStart: { lte: date }, dateEnd: { gte: date }, status: "APPROVED" }
      }),
      this.prisma.leaveDeclaration.count({
        where: { employeeId, dateStart: { lte: date }, dateEnd: { gte: date }, status: "APPROVED" }
      })
    ]);
    return count[0] > 0 || count[1] > 0;
  }

  private async justifiedEmployeeIds(employeeIds: string[], date: Date) {
    if (!employeeIds.length) return new Set<string>();
    const [sickLeaves, leaves] = await Promise.all([
      this.prisma.sickLeaveDeclaration.findMany({
        where: { employeeId: { in: employeeIds }, dateStart: { lte: date }, dateEnd: { gte: date }, status: "APPROVED" },
        select: { employeeId: true }
      }),
      this.prisma.leaveDeclaration.findMany({
        where: { employeeId: { in: employeeIds }, dateStart: { lte: date }, dateEnd: { gte: date }, status: "APPROVED" },
        select: { employeeId: true }
      })
    ]);
    return new Set([...sickLeaves.map(row => row.employeeId), ...leaves.map(row => row.employeeId)]);
  }
}

function identityPunchClauses(employee: { id: string; employeeCode?: string | null; biotimeCode?: string | null; localMatricule?: string | null }) {
  const clauses: Prisma.AttendancePunchWhereInput[] = [{ employeeId: employee.id }];
  const localMatricule = cleanIdentity(employee.localMatricule);
  const biotimeCode = cleanIdentity(employee.biotimeCode);
  const employeeCode = cleanIdentity(employee.employeeCode);
  if (localMatricule) clauses.push({ employee: { localMatricule } });
  if (biotimeCode) clauses.push({ employee: { biotimeCode } });
  if (employeeCode) clauses.push({ employee: { employeeCode } });
  return clauses;
}

function cleanIdentity(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "-" ? trimmed : null;
}

function presumedAbsenceDateRange(filters: { date?: string; dateFrom?: string; dateTo?: string }): Prisma.DateTimeFilter | Date | undefined {
  if (isDateKey(filters.date)) return startOfLocalDay(new Date(`${filters.date}T00:00:00`));
  const from = isDateKey(filters.dateFrom) ? startOfLocalDay(new Date(`${filters.dateFrom}T00:00:00`)) : null;
  const to = isDateKey(filters.dateTo) ? startOfLocalDay(new Date(`${filters.dateTo}T00:00:00`)) : null;
  if (from && to) return from <= to ? { gte: from, lte: to } : { gte: to, lte: from };
  if (from) return { gte: from };
  if (to) return { lte: to };
  return undefined;
}

function isDateKey(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function startOfLocalDay(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalTime(date: Date) {
  return date.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false });
}
