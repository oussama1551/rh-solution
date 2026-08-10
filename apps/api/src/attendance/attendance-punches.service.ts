import { Injectable } from "@nestjs/common";
import { ApprovalStatus, AttendanceSummaryStatus, Prisma, PunchDirection, PunchShiftStatus } from "@prisma/client";
import { employeeScopeWhere, punchEmployeeScopeWhere, shiftAssignmentEmployeeScopeWhere } from "../common/employee-scope";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { AttendanceFlagsService } from "./attendance-flags.service";
import { matchDailyAttendance } from "./shift-matching.engine";

@Injectable()
export class AttendancePunchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: AttendanceFlagsService
  ) {}

  async recordMatchedPunch(input: {
    employeeId: string;
    punchTime: Date;
    sourceUploadedAt?: Date | null;
    direction: PunchDirection;
    zktecoPunchId?: string | null;
    biotimeId?: string | null;
    shiftId?: string | null;
    shiftDate?: string | null;
    shiftStatus: PunchShiftStatus;
    rawPayload?: unknown;
  }) {
    const countsAsPresence = input.shiftStatus !== PunchShiftStatus.OUT_OF_WINDOW;

    const data = {
      employeeId: input.employeeId,
      punchTime: input.punchTime,
      sourceUploadedAt: input.sourceUploadedAt || null,
      direction: input.direction,
      shiftId: input.shiftId || null,
      shiftDate: input.shiftDate ? new Date(`${input.shiftDate}T00:00:00.000Z`) : null,
      shiftStatus: input.shiftStatus,
      countsAsPresence,
      biotimeId: input.biotimeId || null,
      rawPayload: input.rawPayload ?? undefined
    };

    const punch = input.zktecoPunchId
      ? await this.prisma.attendancePunch.upsert({
          where: { zktecoPunchId: input.zktecoPunchId },
          update: data,
          create: {
            ...data,
            zktecoPunchId: input.zktecoPunchId
          }
        })
      : await this.prisma.attendancePunch.create({
          data: {
            ...data,
            zktecoPunchId: null
          }
        });

    // Toute anomalie hors-créneau devient une tâche RH à valider, sans bloquer le pointage physique.
    if (punch.shiftStatus === PunchShiftStatus.OUT_OF_WINDOW) {
      await this.flags.flagOutOfWindowPunch(punch.id);
    }

    return punch;
  }

  async listDetailed(filters: {
    search?: string;
    department?: string;
    direction?: string;
    shiftStatus?: string;
    employeeStatus?: string;
    from?: string;
    to?: string;
    limit?: string;
  }, actor?: RequestUser) {
    const where: Prisma.AttendancePunchWhereInput = {};
    const and: Prisma.AttendancePunchWhereInput[] = [];
    and.push(punchEmployeeScopeWhere(actor));

    if (filters.from || filters.to) {
      where.punchTime = {
        gte: filters.from ? new Date(filters.from) : undefined,
        lte: filters.to ? new Date(filters.to) : undefined
      };
    }

    if (filters.direction && isPunchDirection(filters.direction)) {
      where.direction = filters.direction;
    }

    if (filters.shiftStatus && isPunchShiftStatus(filters.shiftStatus)) {
      where.shiftStatus = filters.shiftStatus;
    }

    if (filters.employeeStatus === "ACTIVE" || filters.employeeStatus === "RESIGNED") {
      and.push({ employee: { status: filters.employeeStatus } });
    }

    if (filters.department?.trim()) {
      and.push({ employee: { department: { contains: filters.department.trim(), mode: "insensitive" } } });
    }

    if (filters.search?.trim()) {
      const search = filters.search.trim();
      and.push({
        OR: [
          { employee: { fullName: { contains: search, mode: "insensitive" } } },
          { employee: { employeeCode: { contains: search, mode: "insensitive" } } },
          { employee: { biotimeCode: { contains: search, mode: "insensitive" } } },
          { employee: { localMatricule: { contains: search, mode: "insensitive" } } },
          { employee: { sapDirectoryRecords: { some: { sapEmpId: { contains: search, mode: "insensitive" } } } } },
          { zktecoPunchId: { contains: search, mode: "insensitive" } },
          { biotimeId: { contains: search, mode: "insensitive" } }
        ]
      });
    }

    if (and.length) {
      where.AND = and;
    }

    const take = Math.min(Math.max(Number(filters.limit || 500), 20), 2000);

    const punches = await this.prisma.attendancePunch.findMany({
      where,
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
            status: true,
            sapDirectoryRecords: {
              orderBy: { lastSyncedAt: "desc" },
              take: 1,
              select: {
                sapEmpId: true,
                sapCompany: true,
                mobile: true,
                poste: true,
                structure: true
              }
            }
          }
        },
        shift: {
          select: {
            id: true,
            code: true,
            name: true,
            startTime: true,
            endTime: true,
            spansMidnight: true
          }
        },
        flags: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            status: true,
            reason: true,
            reviewNote: true
          }
        }
      },
      orderBy: { punchTime: "desc" },
      take
    });

    return punches.map(punch => ({
      id: punch.id,
      punchTime: punch.punchTime,
      punchDate: punch.punchTime.toISOString().slice(0, 10),
      punchHour: punch.punchTime.toISOString().slice(11, 19),
      direction: punch.direction,
      shiftDate: punch.shiftDate,
      shiftStatus: punch.shiftStatus,
      countsAsPresence: punch.countsAsPresence,
      zktecoPunchId: punch.zktecoPunchId,
      biotimeId: punch.biotimeId,
      sourceDevice: rawString(punch.rawPayload, ["terminal_alias", "terminal_name", "device_name", "terminal_sn", "sn"]),
      verifyMode: rawString(punch.rawPayload, ["verify_type", "verify_mode", "verify"]),
      workCode: rawString(punch.rawPayload, ["work_code", "workcode"]),
      employee: {
        ...punch.employee,
        displayMatricule: punch.employee.localMatricule || punch.employee.biotimeCode || punch.employee.employeeCode,
        sapPhone: punch.employee.sapDirectoryRecords[0]?.mobile || null,
        sapCompany: punch.employee.sapDirectoryRecords[0]?.sapCompany || null,
        sapEmpId: punch.employee.sapDirectoryRecords[0]?.sapEmpId || null
      },
      shift: punch.shift,
      flags: punch.flags
    }));
  }

  async listDaily(filters: {
    search?: string;
    department?: string;
    employeeStatus?: string;
    timing?: string;
    shiftType?: string;
    unitId?: string;
    subUnitId?: string;
    groupId?: string;
    employeeId?: string;
    from?: string;
    to?: string;
    month?: string;
  }, actor?: RequestUser) {
    const range = resolveRange(filters);
    const rows = await this.buildDailyRows(filters, range, actor);
    return rows
      .filter(row => !filters.timing || row.shiftType === filters.timing)
      .filter(row => !filters.shiftType || row.shiftType === filters.shiftType)
      .sort((left, right) => `${right.workDate}${right.firstPunchTime}`.localeCompare(`${left.workDate}${left.firstPunchTime}`));
  }

  async employeeMonthlyCalendar(employeeId: string, month: string, actor?: RequestUser) {
    const range = resolveRange({ month });
    const [rawDays, summaryRecords, employeeFallback, liveDeclarations, fallbackPunches] = await Promise.all([
      this.buildDailyRows({ employeeId }, range, actor),
      this.prisma.attendanceSummaryRecord.findMany({
        where: {
          employeeId,
          workDate: { gte: parseDateKey(range.fromKey), lte: parseDateKey(range.toKey) },
          periodStart: parseDateKey(range.fromKey),
          periodEnd: parseDateKey(range.toKey)
        },
        orderBy: [{ workDate: "asc" }, { generatedAt: "desc" }]
      }),
      this.prisma.employee.findFirst({
        where: { id: employeeId, ...employeeScopeWhere(actor) },
        select: employeeCalendarSelect()
      }),
      this.loadCalendarDeclarations(employeeId, range),
      this.loadPunchesForDaily({ employeeId }, range.from, range.to, actor)
    ]);
    const fallbackDays = this.summarizeDaily(fallbackPunches, range.fromKey, range.toKey)
      .map(day => ({
        ...day,
        shiftType: "FLEXIBLE",
        shiftLabel: "Pointage brut",
        assignmentSource: "summary" as const,
        assignedVia: null,
        sourceGroupId: null,
        sourceGroupName: null,
        serviceStatus: day.isIncomplete ? "incomplete" : "complete",
        summaryStatus: null
      }));
    const summaryByDate = new Map(summaryRecords.map(record => [localDateKey(record.workDate), record]));
    const liveStatusByDate = new Map(liveDeclarations.map(row => [row.workDate, row]));
    const showDeclarationPunchNote = canReviewDeclarationPunches(actor);
    const daysByDate = new Map<string, any>(
      [...rawDays, ...fallbackDays.filter(day => !rawDays.some(rawDay => rawDay.workDate === day.workDate))].map(day => [
        day.workDate,
        calendarDayWithDeclarations(day, liveStatusByDate.get(day.workDate), summaryByDate.get(day.workDate), showDeclarationPunchNote)
      ])
    );
    const employee = daysByDate.values().next().value?.employee || employeeFallback;
    if (employee) {
      for (const record of summaryRecords) {
        const workDate = localDateKey(record.workDate);
        if (daysByDate.has(workDate)) continue;
        daysByDate.set(workDate, syntheticCalendarDay(record, employee));
      }
      for (const declaration of liveDeclarations) {
        if (daysByDate.has(declaration.workDate)) continue;
        daysByDate.set(declaration.workDate, syntheticCalendarDayFromStatus(employeeId, declaration.workDate, declaration.status, declaration.label, employee));
      }
    }
    const days = [...daysByDate.values()]
      .sort((left, right) => left.workDate.localeCompare(right.workDate));

    return {
      employee,
      month,
      summaryAvailable: summaryRecords.length > 0,
      period: {
        from: range.fromKey,
        to: range.toKey,
        label: `${formatFrenchDate(range.from)} - ${formatFrenchDate(range.to)}`,
        days: datesBetween(range.fromKey, range.toKey)
      },
      days,
      totals: {
        workedDays: days.filter(day => day.firstPunchTime && day.lastPunchTime).length,
        totalHours: roundHours(days.reduce((sum, day) => sum + day.workedHours, 0)),
        overtimeHours: roundHours(days.reduce((sum, day) => sum + (day.overtimeHours || 0), 0)),
        morningDays: days.filter(day => day.shiftType === "MORNING").length,
        eveningDays: days.filter(day => day.shiftType === "EVENING").length,
        nightDays: days.filter(day => day.shiftType === "NIGHT").length,
        normalDays: days.filter(day => day.shiftType === "FLEXIBLE").length,
        incompleteDays: days.filter(day => day.isIncomplete).length
      }
    };
  }

  private async loadCalendarDeclarations(employeeId: string, range: { from: Date; to: Date; fromKey: string; toKey: string }) {
    const [sickLeaves, leaves, absenceReversals] = await Promise.all([
      this.prisma.sickLeaveDeclaration.findMany({
        where: { employeeId, dateStart: { lte: range.to }, dateEnd: { gte: range.from }, status: ApprovalStatus.APPROVED },
        select: { dateStart: true, dateEnd: true }
      }),
      this.prisma.leaveDeclaration.findMany({
        where: { employeeId, dateStart: { lte: range.to }, dateEnd: { gte: range.from }, status: ApprovalStatus.APPROVED },
        select: { dateStart: true, dateEnd: true }
      }),
      this.prisma.absenceReversalRequest.findMany({
        where: { employeeId, absenceDate: { gte: range.from, lte: range.to }, status: ApprovalStatus.APPROVED },
        select: { absenceDate: true }
      })
    ]);
    const rows: Array<{ workDate: string; status: AttendanceSummaryStatus; label: string }> = [];
    sickLeaves.forEach(row => pushDeclarationDays(rows, range, row.dateStart, row.dateEnd, AttendanceSummaryStatus.SICK, "Maladie"));
    leaves.forEach(row => pushDeclarationDays(rows, range, row.dateStart, row.dateEnd, AttendanceSummaryStatus.LEAVE, "Congé"));
    absenceReversals.forEach(row => rows.push({ workDate: localDateKey(row.absenceDate), status: AttendanceSummaryStatus.ABSENCE_REVERSED, label: "Sans preuve de pointage" }));
    return rows;
  }

  private async buildDailyRows(
    filters: {
      search?: string;
      department?: string;
      employeeStatus?: string;
      employeeId?: string;
      unitId?: string;
      subUnitId?: string;
      groupId?: string;
    },
    range: { from: Date; to: Date; fromKey: string; toKey: string },
    actor?: RequestUser
  ) {
    const [punches, definitions, assignments] = await Promise.all([
      this.loadPunchesForDaily(filters, range.from, range.to, actor),
      this.prisma.shiftDefinition.findMany(),
      this.prisma.employeeShiftAssignment.findMany({
        where: {
          date: { gte: range.from, lte: range.to },
          employeeId: filters.employeeId || undefined,
          status: ApprovalStatus.APPROVED,
          ...shiftAssignmentEmployeeScopeWhere(actor)
        },
        include: {
          shiftDefinition: true,
          sourceGroup: { select: { id: true, name: true } }
        }
      })
    ]);

    const employeesById = new Map(punches.map(punch => [punch.employeeId, punch.employee]));
    const punchesById = new Map(punches.map(punch => [punch.id, punch]));
    const marginOverridesByEmployeeId = Object.fromEntries(
      [...employeesById.values()]
        .filter(employee => isFabSecEmployee(employee))
        .map(employee => [employee.id, 90])
    );
    const results = matchDailyAttendance({
      punches: punches.map(punch => ({ id: punch.id, employeeId: punch.employeeId, punchTime: punch.punchTime })),
      assignments: assignments.map(assignment => ({
        employeeId: assignment.employeeId,
        date: localDateKey(assignment.date),
        shiftDefinitionId: assignment.shiftDefinitionId,
        assignedVia: assignment.assignedVia,
        sourceGroupId: assignment.sourceGroupId,
        sourceGroupName: assignment.sourceGroup?.name || null
      })),
      definitions: definitions.map(definition => ({
        id: definition.id,
        shiftType: definition.shiftType,
        label: definition.label,
        startTime: definition.startTime,
        endTime: definition.endTime,
        spansMidnight: definition.spansMidnight,
        marginMinutes: definition.marginMinutes
      })),
      from: range.fromKey,
      to: range.toKey,
      allowSameDayFallbackExit: true,
      marginOverridesByEmployeeId
    });

    return results.map(result => {
      const employee = employeesById.get(result.employeeId)!;
      const entryRaw = punchesById.get(result.entryPunch.id);
      const exitRaw = result.exitPunch ? punchesById.get(result.exitPunch.id) : null;
      return {
        id: result.id,
        workDate: result.workDate,
        employee: {
          ...employee,
          displayMatricule: employee.localMatricule || employee.biotimeCode || employee.employeeCode,
          sapPhone: employee.sapDirectoryRecords[0]?.mobile || null,
          sapCompany: employee.sapDirectoryRecords[0]?.sapCompany || null,
          sapEmpId: employee.sapDirectoryRecords[0]?.sapEmpId || null
        },
        firstPunchTime: result.entryPunch.punchTime,
        lastPunchTime: result.exitPunch?.punchTime || null,
        firstPunchId: entryRaw?.biotimeId || entryRaw?.zktecoPunchId || result.entryPunch.id,
        lastPunchId: exitRaw ? (exitRaw.biotimeId || exitRaw.zktecoPunchId || exitRaw.id) : null,
        punchCount: result.punchCount,
        workedHours: result.workedHours,
        timing: result.shiftType === "FLEXIBLE" ? "NORMAL" : result.shiftType,
        shiftType: result.shiftType,
        shiftLabel: result.shiftLabel,
        assignmentSource: result.source,
        assignedVia: result.assignedVia,
        sourceGroupId: result.sourceGroupId,
        sourceGroupName: result.sourceGroupName,
        serviceStatus: result.status,
        isIncomplete: result.status === "incomplete",
        sourceDevice: rawString(entryRaw?.rawPayload || null, ["terminal_alias", "terminal_name", "device_name", "terminal_sn", "sn"]) || rawString(exitRaw?.rawPayload || null, ["terminal_alias", "terminal_name", "device_name", "terminal_sn", "sn"])
      };
    });
  }

  private async loadPunchesForDaily(
    filters: { search?: string; department?: string; employeeStatus?: string; employeeId?: string; unitId?: string; subUnitId?: string; groupId?: string },
    from: Date,
    to: Date,
    actor?: RequestUser
  ) {
    const expandedFrom = addDays(from, -1);
    const expandedTo = addDays(to, 1);
    const and: Prisma.AttendancePunchWhereInput[] = [];
    and.push(punchEmployeeScopeWhere(actor));

    if (filters.employeeId) {
      and.push({ employeeId: filters.employeeId });
    }

    if (filters.groupId) {
      and.push({ employee: { groupId: filters.groupId } });
    } else if (filters.subUnitId) {
      and.push({ employee: { group: { subUnitId: filters.subUnitId } } });
    } else if (filters.unitId) {
      and.push({ employee: { group: { subUnit: { unitId: filters.unitId } } } });
    }

    if (filters.employeeStatus === "ACTIVE" || filters.employeeStatus === "RESIGNED") {
      and.push({ employee: { status: filters.employeeStatus } });
    }

    if (filters.department?.trim()) {
      and.push({ employee: { department: { contains: filters.department.trim(), mode: "insensitive" } } });
    }

    if (filters.search?.trim()) {
      const search = filters.search.trim();
      and.push({
        OR: [
          { employee: { fullName: { contains: search, mode: "insensitive" } } },
          { employee: { employeeCode: { contains: search, mode: "insensitive" } } },
          { employee: { biotimeCode: { contains: search, mode: "insensitive" } } },
          { employee: { localMatricule: { contains: search, mode: "insensitive" } } },
          { employee: { sapDirectoryRecords: { some: { sapEmpId: { contains: search, mode: "insensitive" } } } } }
        ]
      });
    }

    return this.prisma.attendancePunch.findMany({
      where: {
        punchTime: { gte: expandedFrom, lt: expandedTo },
        AND: and
      },
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
            status: true,
            sapDirectoryRecords: {
              orderBy: { lastSyncedAt: "desc" },
              take: 1,
              select: { mobile: true, sapCompany: true, sapEmpId: true }
            },
            group: {
              include: {
                subUnit: {
                  include: { unit: true }
                }
              }
            }
          }
        }
      },
      orderBy: [{ employeeId: "asc" }, { punchTime: "asc" }]
    });
  }

  private summarizeDaily(
    punches: Awaited<ReturnType<AttendancePunchesService["loadPunchesForDaily"]>>,
    fromKey: string,
    toKey: string
  ) {
    const grouped = new Map<string, typeof punches>();
    const lastPunchByEmployeeDate = new Map<string, (typeof punches)[number]>();

    for (const punch of punches) {
      const ownDate = localDateKey(punch.punchTime);
      const previousDate = localDateKey(addDays(punch.punchTime, -1));
      const minutes = localMinutes(punch.punchTime);
      const previousLast = lastPunchByEmployeeDate.get(`${punch.employeeId}:${previousDate}`);
      const belongsToPreviousNight = minutes <= 8 * 60 && previousLast && localMinutes(previousLast.punchTime) >= 18 * 60;
      const workDate = belongsToPreviousNight ? previousDate : ownDate;
      const key = `${punch.employeeId}:${workDate}`;

      grouped.set(key, [...(grouped.get(key) || []), punch]);
      lastPunchByEmployeeDate.set(`${punch.employeeId}:${ownDate}`, punch);
    }

    return [...grouped.entries()]
      .map(([key, dayPunches]) => {
        const [, workDate] = key.split(":");
        const sorted = dayPunches.sort((left, right) => left.punchTime.getTime() - right.punchTime.getTime());
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const isIncomplete = sorted.length < 2 || first.id === last.id;
        const workedHours = isIncomplete ? 0 : roundHours((last.punchTime.getTime() - first.punchTime.getTime()) / 3_600_000);
        const timing = classifyTiming(first.punchTime, last.punchTime, isIncomplete);

        return {
          id: key,
          workDate,
          employee: {
            ...first.employee,
            displayMatricule: first.employee.localMatricule || first.employee.biotimeCode || first.employee.employeeCode,
            sapPhone: first.employee.sapDirectoryRecords[0]?.mobile || null,
            sapCompany: first.employee.sapDirectoryRecords[0]?.sapCompany || null,
            sapEmpId: first.employee.sapDirectoryRecords[0]?.sapEmpId || null
          },
          firstPunchTime: first.punchTime,
          lastPunchTime: isIncomplete ? null : last.punchTime,
          firstPunchId: first.biotimeId || first.zktecoPunchId || first.id,
          lastPunchId: isIncomplete ? null : last.biotimeId || last.zktecoPunchId || last.id,
          punchCount: sorted.length,
          workedHours,
          timing,
          isIncomplete,
          sourceDevice: rawString(first.rawPayload, ["terminal_alias", "terminal_name", "device_name", "terminal_sn", "sn"]) || rawString(last.rawPayload, ["terminal_alias", "terminal_name", "device_name", "terminal_sn", "sn"])
        };
      })
      .filter(row => row.workDate >= fromKey && row.workDate <= toKey);
  }
}

function isPunchDirection(value: string): value is PunchDirection {
  return Object.values(PunchDirection).includes(value as PunchDirection);
}

function isPunchShiftStatus(value: string): value is PunchShiftStatus {
  return Object.values(PunchShiftStatus).includes(value as PunchShiftStatus);
}

function rawString(rawPayload: Prisma.JsonValue | null, keys: string[]) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  for (const key of keys) {
    const value = (rawPayload as Prisma.JsonObject)[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return null;
}

function isFabSecEmployee(employee: { group?: { subUnit?: { name?: string | null } | null } | null }) {
  return normalizeOrgName(employee.group?.subUnit?.name) === "FAB SEC";
}

function normalizeOrgName(value?: string | null) {
  return (value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function resolveRange(filters: { from?: string; to?: string; month?: string }) {
  const month = filters.month || new Date().toISOString().slice(0, 7);
  const period = payrollPeriod(month);
  const from = filters.from ? parseLocalDateTime(filters.from, "00:00") : period.from;
  const to = filters.to ? parseLocalDateTime(filters.to, "23:59") : period.to;

  return {
    from,
    to,
    fromKey: localDateKey(from),
    toKey: localDateKey(to)
  };
}

function payrollPeriod(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const to = new Date(year, monthNumber - 1, 25, 23, 59, 59, 999);
  const from = new Date(year, monthNumber - 2, 26, 0, 0, 0, 0);
  return { from, to };
}

function parseLocalDateTime(value: string, fallbackTime: string) {
  const normalized = value.includes("T") ? value : `${value}T${fallbackTime}`;
  return new Date(normalized.length === 16 ? `${normalized}:00` : normalized);
}

function datesBetween(fromKey: string, toKey: string) {
  const dates: string[] = [];
  const cursor = new Date(`${fromKey}T00:00:00`);
  const end = new Date(`${toKey}T00:00:00`);
  while (cursor <= end) {
    dates.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function formatFrenchDate(date: Date) {
  return date.toLocaleDateString("fr-FR");
}

function classifyTiming(first: Date, last: Date, isIncomplete: boolean) {
  const firstMinutes = localMinutes(first);
  const lastMinutes = localMinutes(last);
  const crossesDate = localDateKey(first) !== localDateKey(last);

  if (firstMinutes >= 18 * 60 || (crossesDate && lastMinutes <= 8 * 60)) return "NIGHT";
  if (isIncomplete && firstMinutes < 12 * 60) return "MORNING";
  if (isIncomplete && firstMinutes >= 12 * 60) return "EVENING";
  if (firstMinutes < 12 * 60 && lastMinutes >= 12 * 60) return "NORMAL";
  if (firstMinutes < 12 * 60) return "MORNING";
  return "EVENING";
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function localMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function employeeCalendarSelect() {
  return {
    id: true,
    zktecoId: true,
    biotimeCode: true,
    localMatricule: true,
    employeeCode: true,
    fullName: true,
    department: true,
    status: true,
    sapDirectoryRecords: {
      orderBy: { lastSyncedAt: "desc" },
      take: 1,
      select: { mobile: true, sapCompany: true, sapEmpId: true }
    }
  } as const;
}

function syntheticCalendarDay(record: {
  employeeId: string;
  workDate: Date;
  status: AttendanceSummaryStatus;
  workedHours: Prisma.Decimal | number;
  overtimeHours: Prisma.Decimal | number;
  overtimeHoursRate50: Prisma.Decimal | number;
  overtimeHoursRate75: Prisma.Decimal | number;
  overtimeHoursRate100: Prisma.Decimal | number;
  shiftType: string | null;
}, employee: any) {
  const workDate = localDateKey(record.workDate);
  const shiftType = record.shiftType || (record.status === AttendanceSummaryStatus.REST ? "REPOS" : "FLEXIBLE");
  return {
    id: `${record.employeeId}:${workDate}:summary`,
    workDate,
    employee: {
      ...employee,
      displayMatricule: employee.localMatricule || employee.biotimeCode || employee.employeeCode,
      sapPhone: employee.sapDirectoryRecords?.[0]?.mobile || null,
      sapCompany: employee.sapDirectoryRecords?.[0]?.sapCompany || null,
      sapEmpId: employee.sapDirectoryRecords?.[0]?.sapEmpId || null
    },
    firstPunchTime: null,
    lastPunchTime: null,
    firstPunchId: null,
    lastPunchId: null,
    punchCount: 0,
    workedHours: Number(record.workedHours || 0),
    overtimeHours: Number(record.overtimeHours || 0),
    overtimeHoursRate50: Number(record.overtimeHoursRate50 || 0),
    overtimeHoursRate75: Number(record.overtimeHoursRate75 || 0),
    overtimeHoursRate100: Number(record.overtimeHoursRate100 || 0),
    timing: shiftType === "REPOS" ? "NORMAL" : shiftType === "MORNING" || shiftType === "EVENING" || shiftType === "NIGHT" ? shiftType : "NORMAL",
    shiftType,
    shiftLabel: summaryStatusCalendarLabel(record.status),
    assignmentSource: "summary",
    assignedVia: null,
    sourceGroupId: null,
    sourceGroupName: null,
    serviceStatus: record.status === AttendanceSummaryStatus.INCOMPLETE ? "incomplete" : "complete",
    isIncomplete: record.status === AttendanceSummaryStatus.INCOMPLETE,
    sourceDevice: null,
    summaryStatus: record.status
  };
}

function calendarDayWithDeclarations(day: any, liveDeclaration: { status: AttendanceSummaryStatus; label: string } | undefined, summaryRecord: any, showDeclarationPunchNote: boolean) {
  const summaryStatus = liveDeclaration?.status || summaryRecord?.status || null;
  const base = {
    ...day,
    summaryStatus,
    shiftLabel: liveDeclaration?.label || day.shiftLabel,
    overtimeHours: Number(summaryRecord?.overtimeHours || 0),
    overtimeHoursRate50: Number(summaryRecord?.overtimeHoursRate50 || 0),
    overtimeHoursRate75: Number(summaryRecord?.overtimeHoursRate75 || 0),
    overtimeHoursRate100: Number(summaryRecord?.overtimeHoursRate100 || 0),
    declarationFirstPunchTime: null,
    declarationLastPunchTime: null,
    declarationPunchCount: null
  };
  if (liveDeclaration?.status === AttendanceSummaryStatus.SICK) {
    return {
      ...base,
      declarationFirstPunchTime: showDeclarationPunchNote ? day.firstPunchTime : null,
      declarationLastPunchTime: showDeclarationPunchNote ? day.lastPunchTime : null,
      declarationPunchCount: showDeclarationPunchNote ? day.punchCount : null,
      firstPunchTime: null,
      lastPunchTime: null,
      firstPunchId: null,
      lastPunchId: null,
      punchCount: 0,
      workedHours: 0,
      overtimeHours: 0,
      overtimeHoursRate50: 0,
      overtimeHoursRate75: 0,
      overtimeHoursRate100: 0,
      timing: "NORMAL",
      shiftType: "FLEXIBLE",
      shiftLabel: liveDeclaration.label,
      assignmentSource: "summary",
      serviceStatus: "complete",
      isIncomplete: false
    };
  }
  return base;
}

function canReviewDeclarationPunches(actor?: RequestUser) {
  const roles = new Set(actor?.roles || []);
  return roles.has("ADMIN") || roles.has("DRH") || roles.has("GRH");
}

function syntheticCalendarDayFromStatus(employeeId: string, workDate: string, status: AttendanceSummaryStatus, label: string, employee: any) {
  const shiftType = status === AttendanceSummaryStatus.REST ? "REPOS" : "FLEXIBLE";
  return {
    id: `${employeeId}:${workDate}:declaration`,
    workDate,
    employee: {
      ...employee,
      displayMatricule: employee.localMatricule || employee.biotimeCode || employee.employeeCode,
      sapPhone: employee.sapDirectoryRecords?.[0]?.mobile || null,
      sapCompany: employee.sapDirectoryRecords?.[0]?.sapCompany || null,
      sapEmpId: employee.sapDirectoryRecords?.[0]?.sapEmpId || null
    },
    firstPunchTime: null,
    lastPunchTime: null,
    firstPunchId: null,
    lastPunchId: null,
    punchCount: 0,
    workedHours: 0,
    overtimeHours: 0,
    overtimeHoursRate50: 0,
    overtimeHoursRate75: 0,
    overtimeHoursRate100: 0,
    timing: "NORMAL",
    shiftType,
    shiftLabel: label,
    assignmentSource: "summary",
    assignedVia: null,
    sourceGroupId: null,
    sourceGroupName: null,
    serviceStatus: "complete",
    isIncomplete: false,
    sourceDevice: null,
    summaryStatus: status
  };
}

function pushDeclarationDays(
  rows: Array<{ workDate: string; status: AttendanceSummaryStatus; label: string }>,
  range: { fromKey: string; toKey: string },
  from: Date,
  to: Date,
  status: AttendanceSummaryStatus,
  label: string
) {
  const cursor = new Date(Math.max(new Date(`${range.fromKey}T00:00:00`).getTime(), from.getTime()));
  const end = new Date(Math.min(new Date(`${range.toKey}T00:00:00`).getTime(), to.getTime()));
  while (cursor <= end) {
    const workDate = localDateKey(cursor);
    const existingIndex = rows.findIndex(row => row.workDate === workDate);
    const value = { workDate, status, label };
    if (existingIndex >= 0) rows[existingIndex] = value;
    else rows.push(value);
    cursor.setDate(cursor.getDate() + 1);
  }
}

function summaryStatusCalendarLabel(status: AttendanceSummaryStatus) {
  if (status === AttendanceSummaryStatus.LEAVE) return "Congé";
  if (status === AttendanceSummaryStatus.SICK) return "Maladie";
  if (status === AttendanceSummaryStatus.ACCIDENT) return "Maladie";
  if (status === AttendanceSummaryStatus.REST) return "Repos";
  if (status === AttendanceSummaryStatus.COMPENSATED) return "Compensé";
  if (status === AttendanceSummaryStatus.ABSENT) return "Absent";
  if (status === AttendanceSummaryStatus.INCOMPLETE) return "Incomplet";
  return "Présent";
}
