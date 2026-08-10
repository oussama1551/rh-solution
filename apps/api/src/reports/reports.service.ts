import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  AttendanceFlagStatus,
  AttendanceFlagType,
  ApprovalStatus,
  DeviceStatus,
  EmployeeStatus,
  Prisma,
  PunchDirection,
  PunchShiftStatus
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { matchDailyAttendance } from "../attendance/shift-matching.engine";
import { employeeScopeWhere, isOwnGroupScoped } from "../common/employee-scope";
import { RequestUser } from "../common/request-user.type";
import {
  addDays,
  dayOfWeekForDate,
  enumerateDateKeys,
  minutesBetween,
  parseDateKey,
  plannedDateTime,
  toDateKey
} from "./date-utils";
import { DailyAbsenceReport, DailyAbsenceRow, DashboardKpis, DepartmentReportRow, MonthlyEmployeeReport, PointagePlanningReportRow, ReportFilters } from "./reports.types";

type EmployeeWithReportData = Prisma.EmployeeGetPayload<{
  include: {
    shiftAssignments: { include: { shift: true } };
    attendancePunches: { include: { shift: true; flags: true } };
  };
}>;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async monthlyByEmployee(filters: ReportFilters, actor?: RequestUser): Promise<MonthlyEmployeeReport[]> {
    this.validatePeriod(filters);
    const employees = await this.loadEmployeesWithReportData(filters, actor);

    return employees.map(employee => this.buildEmployeeReport(employee, filters));
  }

  async departmentSummary(filters: ReportFilters, actor?: RequestUser): Promise<DepartmentReportRow[]> {
    const employeeReports = await this.monthlyByEmployee(filters, actor);
    const departments = new Map<string, DepartmentReportRow>();

    for (const report of employeeReports) {
      const department = report.employee.department || "Sans département";
      const row = departments.get(department) ?? {
        department,
        employeeCount: 0,
        expectedDays: 0,
        presentDays: 0,
        absentDays: 0,
        presenceRate: 0,
        lateCount: 0,
        lateMinutes: 0,
        overtimeMinutes: 0,
        outOfWindowPending: 0,
        outOfWindowValidated: 0,
        outOfWindowRejected: 0
      };

      row.employeeCount += 1;
      row.expectedDays += report.expectedDays;
      row.presentDays += report.presentDays;
      row.absentDays += report.absentDays;
      row.lateCount += report.lateCount;
      row.lateMinutes += report.lateMinutes;
      row.overtimeMinutes += report.overtimeMinutes;
      row.outOfWindowPending += report.outOfWindow.pending;
      row.outOfWindowValidated += report.outOfWindow.validated;
      row.outOfWindowRejected += report.outOfWindow.rejected;
      row.presenceRate = row.expectedDays === 0 ? 0 : roundRate(row.presentDays, row.expectedDays);

      departments.set(department, row);
    }

    return [...departments.values()].sort((left, right) => left.department.localeCompare(right.department));
  }

  async pointagePlanning(filters: ReportFilters, actor?: RequestUser): Promise<PointagePlanningReportRow[]> {
    this.validatePeriod(filters);
    const employees = await this.prisma.employee.findMany({
      where: this.employeeWhere(filters, actor),
      orderBy: [{ group: { subUnit: { unit: { name: "asc" } } } }, { group: { subUnit: { name: "asc" } } }, { group: { name: "asc" } }, { fullName: "asc" }],
      select: {
        id: true,
        zktecoId: true,
        biotimeCode: true,
        localMatricule: true,
        employeeCode: true,
        fullName: true,
        department: true,
        status: true,
        group: {
          select: {
            name: true,
            subUnit: {
              select: {
                name: true,
                unit: { select: { name: true } }
              }
            }
          }
        }
      }
    });
    const employeeIds = employees.map(employee => employee.id);
    if (!employeeIds.length) return [];

    const from = parseDateKey(filters.startDate);
    const to = parseDateKey(filters.endDate);
    const [definitions, assignments, punches] = await Promise.all([
      this.prisma.shiftDefinition.findMany(),
      this.prisma.employeeShiftAssignment.findMany({
        where: {
          employeeId: { in: employeeIds },
          date: { gte: from, lte: to },
          status: ApprovalStatus.APPROVED
        },
        include: {
          shiftDefinition: true,
          sourceGroup: { select: { id: true, name: true } }
        }
      }),
      this.prisma.attendancePunch.findMany({
        where: {
          employeeId: { in: employeeIds },
          countsAsPresence: true,
          punchTime: {
            gte: parseDateKey(addDays(filters.startDate, -1)),
            lt: parseDateKey(addDays(filters.endDate, 2))
          }
        },
        orderBy: [{ employeeId: "asc" }, { punchTime: "asc" }]
      })
    ]);

    const employeeById = new Map(employees.map(employee => [employee.id, employee]));
    const assignmentByEmployeeDate = new Map(assignments.map(assignment => [`${assignment.employeeId}:${toDateKey(assignment.date)}`, assignment]));
    const resultByEmployeeDate = new Map<string, ReturnType<typeof matchDailyAttendance>[number]>();
    const results = matchDailyAttendance({
      punches: punches.map(punch => ({ id: punch.id, employeeId: punch.employeeId, punchTime: punch.punchTime })),
      assignments: assignments.map(assignment => ({
        employeeId: assignment.employeeId,
        date: toDateKey(assignment.date),
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
      from: filters.startDate,
      to: filters.endDate,
      marginOverridesByEmployeeId: fabSecMarginOverrides(employees)
    });

    results.forEach(result => resultByEmployeeDate.set(`${result.employeeId}:${result.workDate}`, result));
    this.logUnmatchedPunchDiagnostics(punches, employees, assignmentByEmployeeDate, resultByEmployeeDate, filters);

    const rows: PointagePlanningReportRow[] = [];
    for (const employee of employees) {
      for (const workDate of enumerateDateKeys(filters.startDate, filters.endDate)) {
        const key = `${employee.id}:${workDate}`;
        const assignment = assignmentByEmployeeDate.get(key);
        const result = resultByEmployeeDate.get(key);

        if (!assignment && !result && !filters.employeeId) {
          continue;
        }

        rows.push(this.buildPointagePlanningRow(employee, workDate, assignment, result));
      }
    }

    return rows.sort((left, right) => `${left.workDate}${left.employee.fullName}`.localeCompare(`${right.workDate}${right.employee.fullName}`));
  }

  async dailyAbsences(filters: {
    date?: string;
    unitId?: string;
    subUnitId?: string;
    groupId?: string;
    search?: string;
  }, actor?: RequestUser): Promise<DailyAbsenceReport> {
    const date = filters.date || localDateKey(new Date());
    const dateStart = parseDateKey(date);
    if (Number.isNaN(dateStart.getTime())) {
      throw new BadRequestException("date doit être une date valide.");
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        ...this.employeeWhere({ startDate: date, endDate: date, status: EmployeeStatus.ACTIVE, unitId: filters.unitId, subUnitId: filters.subUnitId, groupId: filters.groupId, search: filters.search }, actor)
      },
      orderBy: [{ group: { subUnit: { unit: { name: "asc" } } } }, { group: { subUnit: { name: "asc" } } }, { group: { name: "asc" } }, { fullName: "asc" }],
      select: {
        id: true,
        biotimeCode: true,
        localMatricule: true,
        employeeCode: true,
        fullName: true,
        department: true,
        group: {
          select: {
            name: true,
            subUnit: {
              select: {
                name: true,
                unit: { select: { name: true } }
              }
            }
          }
        }
      }
    });

    const employeeIds = employees.map(employee => employee.id);
    if (!employeeIds.length) {
      return { date, generatedAt: new Date(), totals: { planned: 0, absent: 0, notDue: 0 }, byUnit: [], rows: [] };
    }

    const from = parseDateKey(date);
    const to = parseDateKey(addDays(date, 1));
    const [definitions, assignments, punches, sickLeaves, leaves, absenceReversals] = await Promise.all([
      this.prisma.shiftDefinition.findMany(),
      this.prisma.employeeShiftAssignment.findMany({
        where: {
          employeeId: { in: employeeIds },
          date: { gte: from, lt: to },
          status: ApprovalStatus.APPROVED
        },
        include: { shiftDefinition: true, sourceGroup: { select: { id: true, name: true } } }
      }),
      this.prisma.attendancePunch.findMany({
        where: {
          employeeId: { in: employeeIds },
          countsAsPresence: true,
          punchTime: {
            gte: new Date(`${addDays(date, -1)}T00:00:00`),
            lt: new Date(`${addDays(date, 2)}T00:00:00`)
          }
        },
        orderBy: [{ employeeId: "asc" }, { punchTime: "asc" }]
      }),
      this.prisma.sickLeaveDeclaration.findMany({
        where: { employeeId: { in: employeeIds }, dateStart: { lte: from }, dateEnd: { gte: from }, status: ApprovalStatus.APPROVED },
        select: { employeeId: true }
      }),
      this.prisma.leaveDeclaration.findMany({
        where: { employeeId: { in: employeeIds }, dateStart: { lte: from }, dateEnd: { gte: from }, status: ApprovalStatus.APPROVED },
        select: { employeeId: true }
      }),
      this.prisma.absenceReversalRequest.findMany({
        where: { employeeId: { in: employeeIds }, absenceDate: from, status: ApprovalStatus.APPROVED },
        select: { employeeId: true }
      })
    ]);
    const justifiedEmployeeIds = new Set([
      ...sickLeaves.map(row => row.employeeId),
      ...leaves.map(row => row.employeeId),
      ...absenceReversals.map(row => row.employeeId)
    ]);

    const results = matchDailyAttendance({
      punches: punches.map(punch => ({ id: punch.id, employeeId: punch.employeeId, punchTime: punch.punchTime })),
      assignments: assignments.map(assignment => ({
        employeeId: assignment.employeeId,
        date: toDateKey(assignment.date),
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
      from: date,
      to: date,
      marginOverridesByEmployeeId: fabSecMarginOverrides(employees)
    });

    const resultByEmployeeDate = new Map(results.map(result => [`${result.employeeId}:${result.workDate}`, result]));
    const assignmentByEmployee = new Map(assignments.map(assignment => [`${assignment.employeeId}:${toDateKey(assignment.date)}`, assignment]));
    const punchesByEmployeeDate = new Map<string, typeof punches>();
    for (const punch of punches) {
      const key = `${punch.employeeId}:${toDateKey(punch.punchTime)}`;
      punchesByEmployeeDate.set(key, [...(punchesByEmployeeDate.get(key) || []), punch]);
    }
    const rows: DailyAbsenceRow[] = [];
    let planned = 0;
    let absent = 0;
    let notDue = 0;

    for (const employee of employees) {
      const assignment = assignmentByEmployee.get(`${employee.id}:${date}`);
      if (!assignment || assignment.shiftDefinition.shiftType === "REPOS") continue;
      if (justifiedEmployeeIds.has(employee.id)) continue;

      planned += 1;
      const result = resultByEmployeeDate.get(`${employee.id}:${date}`);
      if (result && result.punchCount > 0) continue;

      const status = shiftIsDue(date, assignment.shiftDefinition.startTime, assignment.shiftDefinition.marginMinutes) ? "ABSENT" : "NOT_DUE";
      if (status === "ABSENT") absent += 1;
      else notDue += 1;
      const dayPunches = punchesByEmployeeDate.get(`${employee.id}:${date}`) || [];

      rows.push({
        id: `${employee.id}:${date}`,
        date,
        status,
        employee: {
          id: employee.id,
          code: displayMatricule(employee),
          sourceCode: employee.biotimeCode || employee.employeeCode,
          fullName: employee.fullName,
          department: employee.department,
          unitName: employee.group?.subUnit?.unit?.name || null,
          subUnitName: employee.group?.subUnit?.name || null,
          groupName: employee.group?.name || null
        },
        shift: {
          type: assignment.shiftDefinition.shiftType,
          label: assignment.shiftDefinition.label,
          startTime: assignment.shiftDefinition.startTime,
          endTime: assignment.shiftDefinition.endTime
        },
        planning: {
          assignedVia: assignment.assignedVia,
          sourceGroupName: assignment.sourceGroup?.name || null,
          employeeGroupName: employee.group?.name || null
        },
        punches: dayPunches.map(punch => ({
          id: punch.id,
          punchTime: punch.punchTime,
          direction: punch.direction,
          sourceId: punch.biotimeId || punch.zktecoPunchId || punch.id
        }))
      });
    }

    const byUnitMap = new Map<string, { unitName: string; planned: number; absent: number; notDue: number }>();
    for (const employee of employees) {
      const assignment = assignmentByEmployee.get(`${employee.id}:${date}`);
      if (!assignment || assignment.shiftDefinition.shiftType === "REPOS") continue;
      if (justifiedEmployeeIds.has(employee.id)) continue;
      const unitName = employee.group?.subUnit?.unit?.name || "Sans unité";
      const row = byUnitMap.get(unitName) || { unitName, planned: 0, absent: 0, notDue: 0 };
      row.planned += 1;
      const absenceRow = rows.find(item => item.employee.id === employee.id);
      if (absenceRow?.status === "ABSENT") row.absent += 1;
      if (absenceRow?.status === "NOT_DUE") row.notDue += 1;
      byUnitMap.set(unitName, row);
    }

    return {
      date,
      generatedAt: new Date(),
      totals: { planned, absent, notDue },
      byUnit: [...byUnitMap.values()].sort((left, right) => left.unitName.localeCompare(right.unitName)),
      rows: rows.sort((left, right) => `${left.status}${left.employee.unitName}${left.employee.fullName}`.localeCompare(`${right.status}${right.employee.unitName}${right.employee.fullName}`))
    };
  }

  async dashboardKpis(actor?: RequestUser): Promise<DashboardKpis> {
    const now = new Date();
    const today = localDateKey(now);
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const endDate = today;
    const monthly = await this.monthlyByEmployee({ startDate, endDate, status: EmployeeStatus.ACTIVE }, actor);
    const expectedDays = monthly.reduce((sum, row) => sum + row.expectedDays, 0);
    const presentDays = monthly.reduce((sum, row) => sum + row.presentDays, 0);
    const lateCountThisMonth = monthly.reduce((sum, row) => sum + row.lateCount, 0);
    const dailyAbsences = await this.dailyAbsences({ date: today }, actor);
    const monthlyPlanning = await this.pointagePlanning({ startDate, endDate, status: EmployeeStatus.ACTIVE }, actor);
    const scopedEmployeeWhere = employeeScopeWhere(actor);

    const [employeeCount, activeEmployeeCount, pendingAttendanceFlags, offlineDevices, todayAssignments, pendingPlanningRows, pendingGroups] = await Promise.all([
      this.prisma.employee.count({ where: scopedEmployeeWhere }),
      this.prisma.employee.count({ where: { ...scopedEmployeeWhere, status: EmployeeStatus.ACTIVE } }),
      this.prisma.attendanceFlag.count({
        where: {
          type: AttendanceFlagType.OUT_OF_WINDOW,
          status: AttendanceFlagStatus.PENDING,
          punch: { employee: scopedEmployeeWhere }
        }
      }),
      this.prisma.device.count({
        where: { status: DeviceStatus.OFFLINE }
      }),
      this.prisma.employeeShiftAssignment.findMany({
        where: {
          date: parseDateKey(today),
          status: ApprovalStatus.APPROVED,
          shiftDefinition: { shiftType: { not: "REPOS" } },
          ...this.assignmentScopeForDashboard(actor)
        },
        select: {
          employeeId: true,
          sourceGroupId: true,
          shiftDefinition: { select: { label: true } },
          employee: {
            select: {
              groupId: true,
              group: { select: { id: true, name: true } }
            }
          },
          sourceGroup: { select: { id: true, name: true } }
        }
      }),
      this.prisma.employeeShiftAssignment.findMany({
        where: {
          status: ApprovalStatus.PENDING_APPROVAL,
          ...(actor?.id ? { submittedById: actor.id } : {}),
          ...this.assignmentScopeForDashboard(actor)
        },
        select: { submissionId: true, id: true }
      }),
      this.prisma.group.count({
        where: {
          status: ApprovalStatus.PENDING_APPROVAL,
          ...(actor?.id ? { submittedById: actor.id } : {}),
          ...this.groupScopeForDashboard(actor)
        }
      })
    ]);
    const workingGroupMap = new Map<string, { id: string; name: string; employeeIds: Set<string>; shiftLabels: Set<string> }>();
    for (const assignment of todayAssignments) {
      const group = assignment.sourceGroup || assignment.employee.group;
      const groupId = assignment.sourceGroupId || assignment.employee.groupId;
      if (!groupId || !group) continue;
      const row = workingGroupMap.get(groupId) || { id: groupId, name: group.name, employeeIds: new Set<string>(), shiftLabels: new Set<string>() };
      row.employeeIds.add(assignment.employeeId);
      row.shiftLabels.add(assignment.shiftDefinition.label);
      workingGroupMap.set(groupId, row);
    }
    const pendingSubmissionIds = new Set(pendingPlanningRows.map(row => row.submissionId || row.id));

    return {
      presenceRate: expectedDays === 0 ? 0 : roundRate(presentDays, expectedDays),
      lateCountThisMonth,
      pendingAttendanceFlags,
      offlineDevices,
      employeeCount,
      activeEmployeeCount,
      workingGroupsToday: workingGroupMap.size,
      pendingPlanningCount: pendingSubmissionIds.size + pendingGroups,
      absencesToday: dailyAbsences.totals.absent,
      monthlyAbsences: monthlyPlanning.filter(row => row.serviceStatus === "absent").length,
      workingGroups: [...workingGroupMap.values()].map(row => ({
        id: row.id,
        name: row.name,
        employeeCount: row.employeeIds.size,
        shiftLabels: [...row.shiftLabels]
      })).sort((left, right) => left.name.localeCompare(right.name)),
      absenceAlerts: dailyAbsences.rows.filter(row => row.status === "ABSENT").slice(0, 10)
    };
  }

  private assignmentScopeForDashboard(actor?: RequestUser): Prisma.EmployeeShiftAssignmentWhereInput {
    const scoped = employeeScopeWhere(actor);
    return Object.keys(scoped).length ? { employee: scoped } : {};
  }

  private groupScopeForDashboard(actor?: RequestUser): Prisma.GroupWhereInput {
    return isOwnGroupScoped(actor) ? { createdById: actor?.id } : {};
  }

  private async loadEmployeesWithReportData(filters: ReportFilters, actor?: RequestUser) {
    const start = parseDateKey(filters.startDate);
    const endExclusive = parseDateKey(addDays(filters.endDate, 1));

    return this.prisma.employee.findMany({
      where: {
        ...this.employeeWhere(filters, actor)
      },
      orderBy: [{ department: "asc" }, { fullName: "asc" }],
      include: {
        shiftAssignments: {
          where: {
            validFrom: { lte: parseDateKey(filters.endDate) },
            OR: [{ validTo: null }, { validTo: { gte: parseDateKey(filters.startDate) } }]
          },
          include: { shift: true }
        },
        attendancePunches: {
          where: {
            punchTime: {
              gte: start,
              lt: endExclusive
            }
          },
          include: {
            shift: true,
            flags: true
          }
        }
      }
    });
  }

  private employeeWhere(filters: ReportFilters, actor?: RequestUser): Prisma.EmployeeWhereInput {
    const and: Prisma.EmployeeWhereInput[] = [];
    and.push(employeeScopeWhere(actor));
    if (filters.employeeId) and.push({ id: filters.employeeId });
    if (filters.groupId) and.push({ groupId: filters.groupId });
    else if (filters.subUnitId) and.push({ group: { subUnitId: filters.subUnitId } });
    else if (filters.unitId) and.push({ group: { subUnit: { unitId: filters.unitId } } });
    if (filters.department) and.push({ department: { contains: filters.department, mode: "insensitive" } });
    if (filters.status) and.push({ status: filters.status });
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      and.push({
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { employeeCode: { contains: search, mode: "insensitive" } },
          { biotimeCode: { contains: search, mode: "insensitive" } },
          { localMatricule: { contains: search, mode: "insensitive" } }
        ]
      });
    }

    return and.length ? { AND: and } : {};
  }

  private buildPointagePlanningRow(
    employee: Awaited<ReturnType<ReportsService["pointagePlanning"]>>[number]["employee"] extends never ? never : {
      id: string;
      zktecoId: string;
      biotimeCode: string | null;
      localMatricule: string | null;
      employeeCode: string;
      fullName: string;
      department: string | null;
      status: EmployeeStatus;
      group: { name: string; subUnit: { name: string; unit: { name: string } } } | null;
    },
    workDate: string,
    assignment: Prisma.EmployeeShiftAssignmentGetPayload<{ include: { shiftDefinition: true; sourceGroup: { select: { id: true; name: true } } } }> | undefined,
    result: ReturnType<typeof matchDailyAttendance>[number] | undefined
  ): PointagePlanningReportRow {
    const plannedShiftType = assignment?.shiftDefinition.shiftType || result?.shiftType || null;
    const plannedShiftLabel = assignment?.shiftDefinition.label || result?.shiftLabel || null;
    const isRepos = plannedShiftType === "REPOS";

    return {
      id: `${employee.id}:${workDate}`,
      workDate,
      employee: {
        id: employee.id,
        code: displayMatricule(employee),
        sourceCode: employee.biotimeCode || employee.employeeCode,
        fullName: employee.fullName,
        department: employee.department,
        status: employee.status,
        groupName: employee.group?.name || null,
        subUnitName: employee.group?.subUnit?.name || null,
        unitName: employee.group?.subUnit?.unit?.name || null
      },
      plannedShiftType,
      plannedShiftLabel,
      planningSource: assignment ? "assigned" : result ? "fallback" : "empty",
      assignedVia: assignment?.assignedVia || result?.assignedVia || null,
      sourceGroupName: assignment?.sourceGroup?.name || result?.sourceGroupName || null,
      firstPunchTime: result?.entryPunch.punchTime || null,
      lastPunchTime: result?.exitPunch?.punchTime || null,
      punchCount: result?.punchCount || 0,
      workedHours: result?.workedHours || 0,
      serviceStatus: isRepos ? "repos" : result?.status || (assignment ? "absent" : "empty")
    };
  }

  private logUnmatchedPunchDiagnostics(
    punches: Array<{ employeeId: string; punchTime: Date }>,
    employees: Array<{ id: string; fullName: string; localMatricule: string | null; biotimeCode: string | null; employeeCode: string; group: { name: string } | null }>,
    assignmentByEmployeeDate: Map<string, { shiftDefinition: { shiftType: string; label: string }; assignedVia: string; sourceGroup?: { name: string } | null }>,
    resultByEmployeeDate: Map<string, unknown>,
    filters: ReportFilters
  ) {
    const employeeById = new Map(employees.map(employee => [employee.id, employee]));
    const punchCounts = new Map<string, number>();
    const firstPunchByKey = new Map<string, Date>();

    for (const punch of punches) {
      const date = toDateKey(punch.punchTime);
      if (date < filters.startDate || date > filters.endDate) continue;
      const key = `${punch.employeeId}:${date}`;
      punchCounts.set(key, (punchCounts.get(key) || 0) + 1);
      const first = firstPunchByKey.get(key);
      if (!first || punch.punchTime < first) firstPunchByKey.set(key, punch.punchTime);
    }

    for (const [key, count] of punchCounts.entries()) {
      if (resultByEmployeeDate.has(key)) continue;
      const [employeeId, date] = key.split(":");
      const employee = employeeById.get(employeeId);
      if (!employee) continue;
      const assignment = assignmentByEmployeeDate.get(key);
      const reason = assignment
        ? `planning ${assignment.shiftDefinition.shiftType}/${assignment.shiftDefinition.label}`
        : "aucun planning approuvé et aucun shift inféré";
      this.logger.warn(
        `Diagnostic pointage non affiché: ${employee.fullName} (${employee.localMatricule || employee.biotimeCode || employee.employeeCode}) ` +
        `${date}, ${count} punch(es), premier=${firstPunchByKey.get(key)?.toISOString() || "-"}, cause=${reason}.`
      );
    }
  }

  private buildEmployeeReport(employee: EmployeeWithReportData, filters: ReportFilters): MonthlyEmployeeReport {
    const expectedShiftDays = this.expectedShiftDays(employee, filters);
    const presentShiftDays = new Set(
      employee.attendancePunches
        .filter(punch => punch.countsAsPresence)
        .filter(punch => punch.shiftDate)
        .map(punch => `${punch.shiftId || "no-shift"}:${toDateKey(punch.shiftDate!)}`)
    );

    let lateCount = 0;
    let lateMinutes = 0;
    let overtimeMinutes = 0;
    const outOfWindow = {
      pending: 0,
      validated: 0,
      rejected: 0
    };

    for (const punch of employee.attendancePunches) {
      for (const flag of punch.flags) {
        if (flag.type !== AttendanceFlagType.OUT_OF_WINDOW) {
          continue;
        }

        if (flag.status === AttendanceFlagStatus.PENDING) outOfWindow.pending += 1;
        if (flag.status === AttendanceFlagStatus.VALIDATED) outOfWindow.validated += 1;
        if (flag.status === AttendanceFlagStatus.REJECTED) outOfWindow.rejected += 1;
      }

      if (punch.direction === PunchDirection.CHECK_IN && punch.shiftStatus === PunchShiftStatus.LATE && punch.shiftDate && punch.shift) {
        lateCount += 1;
        lateMinutes += minutesBetween(plannedDateTime(toDateKey(punch.shiftDate), punch.shift.startTime), punch.punchTime);
      }
    }

    overtimeMinutes = this.calculateOvertime(employee);

    const expectedDays = expectedShiftDays.size;
    const presentDays = [...expectedShiftDays].filter(key => presentShiftDays.has(key)).length;

    return {
      employee: {
        id: employee.id,
        code: displayMatricule(employee),
        sourceCode: employee.biotimeCode || employee.employeeCode,
        localMatricule: employee.localMatricule,
        fullName: employee.fullName,
        department: employee.department,
        status: employee.status
      },
      period: {
        startDate: filters.startDate,
        endDate: filters.endDate
      },
      expectedDays,
      presentDays,
      absentDays: Math.max(0, expectedDays - presentDays),
      lateCount,
      lateMinutes,
      overtimeMinutes,
      outOfWindow
    };
  }

  private expectedShiftDays(employee: EmployeeWithReportData, filters: ReportFilters): Set<string> {
    const expected = new Set<string>();

    for (const dateKey of enumerateDateKeys(filters.startDate, filters.endDate)) {
      const date = parseDateKey(dateKey);
      const day = dayOfWeekForDate(dateKey);

      for (const assignment of employee.shiftAssignments) {
        const validFrom = parseDateKey(toDateKey(assignment.validFrom));
        const validTo = assignment.validTo ? parseDateKey(toDateKey(assignment.validTo)) : null;
        const activeOnDate = date >= validFrom && (!validTo || date <= validTo);

        if (activeOnDate && assignment.shift.isActive && assignment.shift.applicableDays.includes(day)) {
          expected.add(`${assignment.shiftId}:${dateKey}`);
        }
      }
    }

    return expected;
  }

  private calculateOvertime(employee: EmployeeWithReportData): number {
    const punchesByShiftDay = new Map<string, typeof employee.attendancePunches>();

    for (const punch of employee.attendancePunches) {
      if (!punch.countsAsPresence || !punch.shiftId || !punch.shiftDate || !punch.shift) {
        continue;
      }

      const key = `${punch.shiftId}:${toDateKey(punch.shiftDate)}`;
      punchesByShiftDay.set(key, [...(punchesByShiftDay.get(key) ?? []), punch]);
    }

    let overtime = 0;

    for (const punches of punchesByShiftDay.values()) {
      const shift = punches[0].shift;
      const shiftDate = toDateKey(punches[0].shiftDate!);
      const checkIns = punches.filter(punch => punch.direction === PunchDirection.CHECK_IN).sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());
      const checkOuts = punches.filter(punch => punch.direction === PunchDirection.CHECK_OUT).sort((a, b) => b.punchTime.getTime() - a.punchTime.getTime());

      if (!shift || checkIns.length === 0 || checkOuts.length === 0) {
        continue;
      }

      const plannedStart = plannedDateTime(shiftDate, shift.startTime);
      const plannedEnd = plannedDateTime(shift.spansMidnight ? addDays(shiftDate, 1) : shiftDate, shift.endTime);
      const plannedMinutes = minutesBetween(plannedStart, plannedEnd);
      const workedMinutes = minutesBetween(checkIns[0].punchTime, checkOuts[0].punchTime);
      overtime += Math.max(0, workedMinutes - plannedMinutes);
    }

    return overtime;
  }

  private validatePeriod(filters: ReportFilters) {
    if (!filters.startDate || !filters.endDate) {
      throw new BadRequestException("startDate et endDate sont obligatoires.");
    }

    if (filters.endDate < filters.startDate) {
      throw new BadRequestException("endDate doit être après startDate.");
    }
  }
}

function roundRate(value: number, total: number): number {
  return Math.round((value / total) * 10_000) / 100;
}

function displayMatricule(employee: { localMatricule: string | null; biotimeCode: string | null; employeeCode: string }) {
  return employee.localMatricule || employee.biotimeCode || employee.employeeCode;
}

function shiftIsDue(dateKey: string, startTime: string | null, marginMinutes = 0) {
  if (!startTime) return true;
  const today = localDateKey(new Date());
  if (dateKey < today) return true;
  if (dateKey > today) return false;

  const dueAt = new Date(`${dateKey}T${startTime}`);
  dueAt.setMinutes(dueAt.getMinutes() + Math.max(0, marginMinutes));
  return Date.now() >= dueAt.getTime();
}

function fabSecMarginOverrides(employees: Array<{ id: string; group?: { subUnit?: { name?: string | null } | null } | null }>) {
  return Object.fromEntries(
    employees
      .filter(employee => normalizeOrgName(employee.group?.subUnit?.name) === "FAB SEC")
      .map(employee => [employee.id, 90])
  );
}

function normalizeOrgName(value?: string | null) {
  return (value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
