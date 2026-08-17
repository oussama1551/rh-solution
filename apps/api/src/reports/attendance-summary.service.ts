import { BadRequestException, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ApprovalStatus, AttendanceSummaryStatus, EmployeeStatus, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { enumerateDateKeys, parseDateKey, toDateKey } from "./date-utils";
import { ReportsService } from "./reports.service";
import { ReportFilters, SummaryDailyRecordRow, SummaryReportRow } from "./reports.types";

@Injectable()
export class AttendanceSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly audit: AuditService
  ) {}

  async generateForPeriod(filters: ReportFilters, actor?: RequestUser) {
    this.validatePeriod(filters.startDate, filters.endDate);
    const requestedEndDate = filters.endDate;
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const analysisEndDate = minDate(requestedEndDate, toDateKey(yesterday));
    if (analysisEndDate < filters.startDate) {
      return { generatedAt: new Date(), periodStart: filters.startDate, periodEnd: requestedEndDate, analysisThrough: analysisEndDate, records: 0 };
    }
    const analysisFilters = { ...filters, endDate: analysisEndDate };
    const generatedAt = new Date();
    const scopedFilters = { ...analysisFilters, status: filters.status || EmployeeStatus.ACTIVE };
    const [pointages, scopedEmployees] = await Promise.all([
      this.reports.pointagePlanning(scopedFilters, actor),
      this.prisma.employee.findMany({ where: (this.reports as any).employeeWhere(scopedFilters, actor), select: { id: true } })
    ]);
    const employeeIds = [...new Set(scopedEmployees.map(employee => employee.id))];
    if (!employeeIds.length) return { generatedAt, periodStart: filters.startDate, periodEnd: requestedEndDate, analysisThrough: analysisEndDate, records: 0 };

    const from = parseDateKey(filters.startDate);
    const to = parseDateKey(analysisEndDate);
    const periodEnd = parseDateKey(requestedEndDate);
    const [overtime, compensations, sickLeaves, leaves, absenceReversals] = await Promise.all([
      this.prisma.overtimeDeclaration.findMany({
        where: { employeeId: { in: employeeIds }, date: { gte: from, lte: to }, status: ApprovalStatus.APPROVED }
      }),
      this.prisma.absenceCompensation.findMany({
        where: {
          employeeId: { in: employeeIds },
          OR: [
            { absenceDate: { gte: from, lte: to } },
            { compensationDate: { gte: from, lte: to } }
          ],
          status: ApprovalStatus.APPROVED
        }
      }),
      this.prisma.sickLeaveDeclaration.findMany({
        where: {
          employeeId: { in: employeeIds },
          dateStart: { lte: to },
          dateEnd: { gte: from },
          status: ApprovalStatus.APPROVED
        }
      }),
      this.prisma.leaveDeclaration.findMany({
        where: {
          employeeId: { in: employeeIds },
          dateStart: { lte: to },
          dateEnd: { gte: from },
          status: ApprovalStatus.APPROVED
        }
      }),
      this.prisma.absenceReversalRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          absenceDate: { gte: from, lte: to },
          status: ApprovalStatus.APPROVED
        }
      })
    ]);

    const overtimeByEmployeeDate = new Map<string, { total: number; rate50: number; rate75: number; rate100: number }>();
    overtime.forEach(row => {
      const key = `${row.employeeId}:${toDateKey(row.date)}`;
      const current = overtimeByEmployeeDate.get(key) || { total: 0, rate50: 0, rate75: 0, rate100: 0 };
      const hours = Number(row.hours);
      current.total += hours;
      if (row.rateType === "RATE_50") current.rate50 += hours;
      if (row.rateType === "RATE_75") current.rate75 += hours;
      if (row.rateType === "RATE_100") current.rate100 += hours;
      overtimeByEmployeeDate.set(key, current);
    });
    const compensationDates = new Set(compensations.map(row => `${row.employeeId}:${toDateKey(row.compensationDate)}`));
    const absenceReversalDates = new Set(absenceReversals.map(row => `${row.employeeId}:${toDateKey(row.absenceDate)}`));
    const sickDates = new Set<string>();
    sickLeaves.forEach(row => {
      for (const date of enumerateDateKeys(maxDate(filters.startDate, toDateKey(row.dateStart)), minDate(analysisEndDate, toDateKey(row.dateEnd)))) {
        sickDates.add(`${row.employeeId}:${date}`);
      }
    });
    const leaveDates = new Set<string>();
    const leaveDetailsByEmployeeDate = new Map<string, { leaveType: any; exceptionalReason: any }>();
    leaves.forEach(row => {
      for (const date of enumerateDateKeys(maxDate(filters.startDate, toDateKey(row.dateStart)), minDate(analysisEndDate, toDateKey(row.dateEnd)))) {
        const key = `${row.employeeId}:${date}`;
        leaveDates.add(key);
        leaveDetailsByEmployeeDate.set(key, { leaveType: row.leaveType, exceptionalReason: row.exceptionalReason });
      }
    });

    let count = 0;
    const writtenKeys = new Set<string>();
    await this.prisma.$transaction(async tx => {
      await tx.attendanceSummaryRecord.deleteMany({
        where: {
          employeeId: { in: employeeIds },
          periodStart: from,
          periodEnd
        }
      });

      for (const row of pointages) {
        const key = `${row.employee.id}:${row.workDate}`;
        writtenKeys.add(key);
        const isSick = sickDates.has(key);
        const isLeave = leaveDates.has(key);
        const isCompensation = compensationDates.has(key);
        const overtimeHours = overtimeByEmployeeDate.get(key) || { total: 0, rate50: 0, rate75: 0, rate100: 0 };
        const baseStatus = row.plannedShiftType === "REPOS"
          ? AttendanceSummaryStatus.REST
          : isSick
          ? AttendanceSummaryStatus.SICK
          : isLeave
          ? AttendanceSummaryStatus.LEAVE
          : isCompensation
            ? AttendanceSummaryStatus.COMPENSATED
            : summaryStatusFromService(row.serviceStatus);
        const status = baseStatus === AttendanceSummaryStatus.ABSENT && absenceReversalDates.has(key)
          ? AttendanceSummaryStatus.ABSENCE_REVERSED
          : baseStatus;
        const leaveDetails = status === AttendanceSummaryStatus.LEAVE ? leaveDetailsByEmployeeDate.get(key) || null : null;
        const workedHours = status === AttendanceSummaryStatus.SICK ? 0 : row.workedHours || 0;
        await tx.attendanceSummaryRecord.upsert({
          where: { employeeId_workDate_periodStart_periodEnd: { employeeId: row.employee.id, workDate: parseDateKey(row.workDate), periodStart: from, periodEnd } },
          update: {
            status,
            workedHours: new Prisma.Decimal(workedHours),
            overtimeHours: new Prisma.Decimal(overtimeHours.total),
            overtimeHoursRate50: new Prisma.Decimal(overtimeHours.rate50),
            overtimeHoursRate75: new Prisma.Decimal(overtimeHours.rate75),
            overtimeHoursRate100: new Prisma.Decimal(overtimeHours.rate100),
            isCompensation,
            leaveType: leaveDetails?.leaveType || null,
            exceptionalReason: leaveDetails?.exceptionalReason || null,
            shiftType: row.plannedShiftType as any,
            generatedAt,
            periodStart: from,
            periodEnd
          },
          create: {
            employeeId: row.employee.id,
            workDate: parseDateKey(row.workDate),
            status,
            workedHours: new Prisma.Decimal(workedHours),
            overtimeHours: new Prisma.Decimal(overtimeHours.total),
            overtimeHoursRate50: new Prisma.Decimal(overtimeHours.rate50),
            overtimeHoursRate75: new Prisma.Decimal(overtimeHours.rate75),
            overtimeHoursRate100: new Prisma.Decimal(overtimeHours.rate100),
            isCompensation,
            leaveType: leaveDetails?.leaveType || null,
            exceptionalReason: leaveDetails?.exceptionalReason || null,
            shiftType: row.plannedShiftType as any,
            generatedAt,
            periodStart: from,
            periodEnd
          }
        });
        count += 1;
      }

      for (const key of sickDates) {
        if (writtenKeys.has(key)) continue;
        const [employeeId, workDate] = key.split(":");
        if (!employeeIds.includes(employeeId)) continue;
        const overtimeHours = overtimeByEmployeeDate.get(key) || { total: 0, rate50: 0, rate75: 0, rate100: 0 };
        await tx.attendanceSummaryRecord.upsert({
          where: { employeeId_workDate_periodStart_periodEnd: { employeeId, workDate: parseDateKey(workDate), periodStart: from, periodEnd } },
          update: {
            status: AttendanceSummaryStatus.SICK,
            workedHours: new Prisma.Decimal(0),
            overtimeHours: new Prisma.Decimal(overtimeHours.total),
            overtimeHoursRate50: new Prisma.Decimal(overtimeHours.rate50),
            overtimeHoursRate75: new Prisma.Decimal(overtimeHours.rate75),
            overtimeHoursRate100: new Prisma.Decimal(overtimeHours.rate100),
            isCompensation: false,
            shiftType: null,
            generatedAt,
            periodStart: from,
            periodEnd
          },
          create: {
            employeeId,
            workDate: parseDateKey(workDate),
            status: AttendanceSummaryStatus.SICK,
            workedHours: new Prisma.Decimal(0),
            overtimeHours: new Prisma.Decimal(overtimeHours.total),
            overtimeHoursRate50: new Prisma.Decimal(overtimeHours.rate50),
            overtimeHoursRate75: new Prisma.Decimal(overtimeHours.rate75),
            overtimeHoursRate100: new Prisma.Decimal(overtimeHours.rate100),
            isCompensation: false,
            shiftType: null,
            generatedAt,
            periodStart: from,
            periodEnd
          }
        });
        writtenKeys.add(key);
        count += 1;
      }

      for (const key of leaveDates) {
        if (writtenKeys.has(key)) continue;
        const [employeeId, workDate] = key.split(":");
        if (!employeeIds.includes(employeeId)) continue;
        const overtimeHours = overtimeByEmployeeDate.get(key) || { total: 0, rate50: 0, rate75: 0, rate100: 0 };
        const leaveDetails = leaveDetailsByEmployeeDate.get(key) || null;
        await tx.attendanceSummaryRecord.upsert({
          where: { employeeId_workDate_periodStart_periodEnd: { employeeId, workDate: parseDateKey(workDate), periodStart: from, periodEnd } },
          update: {
            status: AttendanceSummaryStatus.LEAVE,
            workedHours: new Prisma.Decimal(0),
            overtimeHours: new Prisma.Decimal(overtimeHours.total),
            overtimeHoursRate50: new Prisma.Decimal(overtimeHours.rate50),
            overtimeHoursRate75: new Prisma.Decimal(overtimeHours.rate75),
            overtimeHoursRate100: new Prisma.Decimal(overtimeHours.rate100),
            isCompensation: false,
            leaveType: leaveDetails?.leaveType || null,
            exceptionalReason: leaveDetails?.exceptionalReason || null,
            shiftType: null,
            generatedAt,
            periodStart: from,
            periodEnd
          },
          create: {
            employeeId,
            workDate: parseDateKey(workDate),
            status: AttendanceSummaryStatus.LEAVE,
            workedHours: new Prisma.Decimal(0),
            overtimeHours: new Prisma.Decimal(overtimeHours.total),
            overtimeHoursRate50: new Prisma.Decimal(overtimeHours.rate50),
            overtimeHoursRate75: new Prisma.Decimal(overtimeHours.rate75),
            overtimeHoursRate100: new Prisma.Decimal(overtimeHours.rate100),
            isCompensation: false,
            leaveType: leaveDetails?.leaveType || null,
            exceptionalReason: leaveDetails?.exceptionalReason || null,
            shiftType: null,
            generatedAt,
            periodStart: from,
            periodEnd
          }
        });
        writtenKeys.add(key);
        count += 1;
      }

      for (const [key, overtimeHours] of overtimeByEmployeeDate.entries()) {
        if (writtenKeys.has(key)) continue;
        const [employeeId, workDate] = key.split(":");
        await tx.attendanceSummaryRecord.upsert({
          where: { employeeId_workDate_periodStart_periodEnd: { employeeId, workDate: parseDateKey(workDate), periodStart: from, periodEnd } },
          update: {
            status: AttendanceSummaryStatus.PRESENT,
            workedHours: new Prisma.Decimal(0),
            overtimeHours: new Prisma.Decimal(overtimeHours.total),
            overtimeHoursRate50: new Prisma.Decimal(overtimeHours.rate50),
            overtimeHoursRate75: new Prisma.Decimal(overtimeHours.rate75),
            overtimeHoursRate100: new Prisma.Decimal(overtimeHours.rate100),
            isCompensation: compensationDates.has(key),
            shiftType: null,
            generatedAt,
            periodStart: from,
            periodEnd
          },
          create: {
            employeeId,
            workDate: parseDateKey(workDate),
            status: AttendanceSummaryStatus.PRESENT,
            workedHours: new Prisma.Decimal(0),
            overtimeHours: new Prisma.Decimal(overtimeHours.total),
            overtimeHoursRate50: new Prisma.Decimal(overtimeHours.rate50),
            overtimeHoursRate75: new Prisma.Decimal(overtimeHours.rate75),
            overtimeHoursRate100: new Prisma.Decimal(overtimeHours.rate100),
            isCompensation: compensationDates.has(key),
            shiftType: null,
            generatedAt,
            periodStart: from,
            periodEnd
          }
        });
        count += 1;
      }
    }, { maxWait: 10_000, timeout: 120_000 });

    await this.audit.record({
      userId: actor?.id,
      action: "attendance_summary.generate",
      entityType: "attendance_summary_records",
      metadata: { periodStart: filters.startDate, periodEnd: requestedEndDate, analysisThrough: analysisEndDate, records: count } as Prisma.InputJsonValue
    });

    return { generatedAt, periodStart: filters.startDate, periodEnd: requestedEndDate, analysisThrough: analysisEndDate, records: count };
  }

  async report(filters: ReportFilters, actor?: RequestUser): Promise<SummaryReportRow[]> {
    this.validatePeriod(filters.startDate, filters.endDate);
    const records = await this.prisma.attendanceSummaryRecord.findMany({
      where: {
        periodStart: parseDateKey(filters.startDate),
        periodEnd: parseDateKey(filters.endDate),
        employee: (this.reports as any).employeeWhere(filters, actor)
      },
      include: {
        employee: {
          select: {
            id: true,
            localMatricule: true,
            biotimeCode: true,
            employeeCode: true,
            fullName: true,
            department: true,
            group: { select: { name: true, subUnit: { select: { name: true, unit: { select: { name: true } } } } } }
          }
        }
      },
      orderBy: [{ employee: { fullName: "asc" } }, { workDate: "asc" }]
    });

    const byEmployee = new Map<string, SummaryReportRow>();
    for (const record of records) {
      const row = byEmployee.get(record.employeeId) || {
        employee: {
          id: record.employee.id,
          code: record.employee.localMatricule || record.employee.biotimeCode || record.employee.employeeCode,
          sourceCode: record.employee.biotimeCode || record.employee.employeeCode,
          fullName: record.employee.fullName,
          department: record.employee.department,
          unitName: record.employee.group?.subUnit?.unit?.name || null,
          subUnitName: record.employee.group?.subUnit?.name || null,
          groupName: record.employee.group?.name || null
        },
        presentDays: 0,
        absentDays: 0,
        sickDays: 0,
        leaveDays: 0,
        compensatedDays: 0,
        absenceReversedDays: 0,
        restDays: 0,
        incompleteDays: 0,
        totalWorkedHours: 0,
        totalOvertimeHours: 0,
        overtimeHoursRate50: 0,
        overtimeHoursRate75: 0,
        overtimeHoursRate100: 0,
        lastGeneratedAt: record.generatedAt
      };
      if (record.status === AttendanceSummaryStatus.PRESENT) row.presentDays += 1;
      if (record.status === AttendanceSummaryStatus.ABSENT) row.absentDays += 1;
      if (record.status === AttendanceSummaryStatus.SICK || record.status === AttendanceSummaryStatus.ACCIDENT) row.sickDays += 1;
      if (record.status === AttendanceSummaryStatus.LEAVE) row.leaveDays += 1;
      if (record.status === AttendanceSummaryStatus.COMPENSATED) row.compensatedDays += 1;
      if (record.status === AttendanceSummaryStatus.ABSENCE_REVERSED) row.absenceReversedDays += 1;
      if (record.status === AttendanceSummaryStatus.REST) row.restDays += 1;
      if (record.status === AttendanceSummaryStatus.INCOMPLETE) row.incompleteDays += 1;
      row.totalWorkedHours += Number(record.workedHours);
      row.totalOvertimeHours += Number(record.overtimeHours);
      row.overtimeHoursRate50 += Number(record.overtimeHoursRate50);
      row.overtimeHoursRate75 += Number(record.overtimeHoursRate75);
      row.overtimeHoursRate100 += Number(record.overtimeHoursRate100);
      if (record.generatedAt > row.lastGeneratedAt) row.lastGeneratedAt = record.generatedAt;
      byEmployee.set(record.employeeId, row);
    }

    return [...byEmployee.values()].map(row => ({
      ...row,
      totalWorkedHours: round2(row.totalWorkedHours),
      totalOvertimeHours: round2(row.totalOvertimeHours),
      overtimeHoursRate50: round2(row.overtimeHoursRate50),
      overtimeHoursRate75: round2(row.overtimeHoursRate75),
      overtimeHoursRate100: round2(row.overtimeHoursRate100)
    }));
  }

  async dailyRecords(filters: ReportFilters, actor?: RequestUser): Promise<SummaryDailyRecordRow[]> {
    this.validatePeriod(filters.startDate, filters.endDate);
    const records = await this.prisma.attendanceSummaryRecord.findMany({
      where: {
        periodStart: parseDateKey(filters.startDate),
        periodEnd: parseDateKey(filters.endDate),
        employee: (this.reports as any).employeeWhere(filters, actor)
      },
      orderBy: [{ workDate: "asc" }]
    });

    return records.map(record => ({
      id: record.id,
      workDate: toDateKey(record.workDate),
      status: record.status,
      workedHours: Number(record.workedHours),
      overtimeHours: Number(record.overtimeHours),
      overtimeHoursRate50: Number(record.overtimeHoursRate50),
      overtimeHoursRate75: Number(record.overtimeHoursRate75),
      overtimeHoursRate100: Number(record.overtimeHoursRate100),
      shiftType: record.shiftType,
      leaveType: record.leaveType,
      exceptionalReason: record.exceptionalReason,
      generatedAt: record.generatedAt
    }));
  }

  @Cron(process.env.ATTENDANCE_SUMMARY_CRON || "15 2 * * *")
  async generateCurrentPeriodPastDays() {
    const today = toDateKey(new Date());
    const period = currentPayrollPeriod(today);
    if (period.startDate > period.endDate) return;
    await this.generateForPeriod({ startDate: period.startDate, endDate: period.endDate, status: EmployeeStatus.ACTIVE });
  }

  private validatePeriod(startDate?: string, endDate?: string) {
    if (!startDate || !endDate) throw new BadRequestException("startDate et endDate sont obligatoires.");
    if (endDate < startDate) throw new BadRequestException("endDate doit être après startDate.");
  }
}

function summaryStatusFromService(status: string) {
  if (status === "complete") return AttendanceSummaryStatus.PRESENT;
  if (status === "incomplete") return AttendanceSummaryStatus.INCOMPLETE;
  if (status === "repos" || status === "empty") return AttendanceSummaryStatus.REST;
  return AttendanceSummaryStatus.ABSENT;
}

function minDate(left: string, right: string) {
  return left < right ? left : right;
}

function maxDate(left: string, right: string) {
  return left > right ? left : right;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function currentPayrollPeriod(todayKey: string) {
  const startDay = Number(process.env.SHIFT_PERIOD_START_DAY || 26);
  const today = parseDateKey(todayKey);
  const periodEnd = today.getUTCDate() >= startDay
    ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, startDay - 1))
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), startDay - 1));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, startDay));
  return {
    startDate: toDateKey(periodStart),
    endDate: toDateKey(periodEnd)
  };
}
