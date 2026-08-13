import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { AdvancedTreatmentRiskLevel, ApprovalStatus, EmployeeStatus, Prisma } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { AuditService } from "../audit/audit.service";
import { employeeScopeWhere } from "../common/employee-scope";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { RoleCode } from "../roles/role-codes";
import { addDays, enumerateDateKeys, parseDateKey, toDateKey } from "../reports/date-utils";
import { SapDirectoryService } from "../sap/sap-directory.service";

export type AdvancedTreatmentQuery = {
  startDate?: string;
  endDate?: string;
  search?: string;
  unitId?: string;
  subUnitId?: string;
  groupId?: string;
  riskLevel?: AdvancedTreatmentRiskLevel | "";
  netPay?: string;
  company?: string;
};

type AdvancedTreatmentRow = {
  employee: {
    id: string;
    code: string;
    fullName: string;
    department: string | null;
    hireDate: string | null;
    unitName: string | null;
    subUnitName: string | null;
    groupName: string | null;
    lastName: string | null;
    firstName: string | null;
    company: string | null;
  };
  periodStart: string;
  periodEnd: string;
  seniorityMonths: number;
  bankAccount: string | null;
  punchedDays: number;
  emptyDays: number;
  justifiedDays: number;
  sickDays: number;
  leaveDays: number;
  analyzableDays: number;
  riskLevel: AdvancedTreatmentRiskLevel;
  riskLabel: string;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedBy: { id: string; username: string; fullName: string | null } | null;
  frozen: boolean;
  frozenAt: string | null;
  frozenBy: { id: string; username: string; fullName: string | null } | null;
};

type AdvancedTreatmentCalendarDay = {
  date: string;
  punches: Array<{
    id: string;
    punchTime: string;
    punchHour: string;
    sourceDevice: string | null;
  }>;
  sick: boolean;
  leave: boolean;
  warning: boolean;
};

@Injectable()
export class AdvancedTreatmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sapDirectory: SapDirectoryService
  ) {}

  async list(query: AdvancedTreatmentQuery, actor: RequestUser) {
    const period = normalizePeriod(query);
    const rows = await this.computeRows(period, query, actor);
    const filteredRows = query.riskLevel ? rows.filter(row => row.riskLevel === query.riskLevel) : rows;
    const stats = filteredRows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc.confirmed += row.confirmed ? 1 : 0;
        acc.frozen += row.frozen ? 1 : 0;
        acc.missingBankAccount += row.bankAccount ? 0 : 1;
        acc.high += row.riskLevel === AdvancedTreatmentRiskLevel.HIGH ? 1 : 0;
        acc.medium += row.riskLevel === AdvancedTreatmentRiskLevel.MEDIUM ? 1 : 0;
        acc.low += row.riskLevel === AdvancedTreatmentRiskLevel.LOW ? 1 : 0;
        if (row.confirmed) {
          acc.confirmedByCompany[normalizeCompany(row.employee.company)] += 1;
        }
        return acc;
      },
      {
        total: 0,
        confirmed: 0,
        frozen: 0,
        missingBankAccount: 0,
        high: 0,
        medium: 0,
        low: 0,
        confirmedByCompany: emptyCompanyStats()
      }
    );

    return { periodStart: period.startDate, periodEnd: period.endDate, rows: filteredRows, stats };
  }

  async confirm(employeeId: string, query: AdvancedTreatmentQuery, actor: RequestUser, note?: string) {
    this.ensureCanConfirm(actor);
    const period = normalizePeriod(query);
    const row = (await this.computeRows(period, { ...query, search: undefined, riskLevel: undefined }, actor))
      .find(item => item.employee.id === employeeId);
    if (!row) throw new BadRequestException("Employé introuvable ou non éligible pour cette période.");

    const confirmation = await this.prisma.advancedTreatmentConfirmation.upsert({
      where: {
        employeeId_periodStart_periodEnd: {
          employeeId,
          periodStart: parseDateKey(period.startDate),
          periodEnd: parseDateKey(period.endDate)
        }
      },
      update: {
        riskLevel: row.riskLevel,
        emptyDays: row.emptyDays,
        punchedDays: row.punchedDays,
        justifiedDays: row.justifiedDays,
        bankAccount: row.bankAccount,
        note: normalizeOptionalText(note),
        confirmedById: actor.id,
        confirmedAt: new Date()
      },
      create: {
        employeeId,
        periodStart: parseDateKey(period.startDate),
        periodEnd: parseDateKey(period.endDate),
        riskLevel: row.riskLevel,
        emptyDays: row.emptyDays,
        punchedDays: row.punchedDays,
        justifiedDays: row.justifiedDays,
        bankAccount: row.bankAccount,
        note: normalizeOptionalText(note),
        confirmedById: actor.id
      },
      include: { confirmedBy: { select: { id: true, username: true, fullName: true } } }
    });

    await this.audit.record({
      userId: actor.id,
      action: "advanced_treatment.confirm",
      entityType: "employee",
      entityId: employeeId,
      after: confirmation as unknown as Prisma.InputJsonValue,
      metadata: { period }
    });
    return { confirmed: true, confirmation };
  }

  async unconfirm(employeeId: string, query: AdvancedTreatmentQuery, actor: RequestUser) {
    this.ensureCanConfirm(actor);
    const period = normalizePeriod(query);
    const deleted = await this.prisma.advancedTreatmentConfirmation.deleteMany({
      where: {
        employeeId,
        periodStart: parseDateKey(period.startDate),
        periodEnd: parseDateKey(period.endDate)
      }
    });
    await this.audit.record({
      userId: actor.id,
      action: "advanced_treatment.unconfirm",
      entityType: "employee",
      entityId: employeeId,
      metadata: { period, count: deleted.count }
    });
    return { confirmed: false, deleted: deleted.count };
  }

  async freeze(employeeId: string, query: AdvancedTreatmentQuery, actor: RequestUser, reason?: string) {
    this.ensureCanConfirm(actor);
    const period = normalizePeriod(query);
    const row = (await this.computeRows(period, { ...query, search: undefined, riskLevel: undefined }, actor))
      .find(item => item.employee.id === employeeId);
    if (!row) throw new BadRequestException("Employé introuvable ou non éligible pour cette période.");

    const freeze = await this.prisma.advancedTreatmentFreeze.upsert({
      where: {
        employeeId_periodStart_periodEnd: {
          employeeId,
          periodStart: parseDateKey(period.startDate),
          periodEnd: parseDateKey(period.endDate)
        }
      },
      update: {
        frozenById: actor.id,
        frozenAt: new Date(),
        reason: normalizeOptionalText(reason)
      },
      create: {
        employeeId,
        periodStart: parseDateKey(period.startDate),
        periodEnd: parseDateKey(period.endDate),
        frozenById: actor.id,
        reason: normalizeOptionalText(reason)
      }
    });
    await this.audit.record({
      userId: actor.id,
      action: "advanced_treatment.freeze",
      entityType: "employee",
      entityId: employeeId,
      after: freeze as unknown as Prisma.InputJsonValue,
      metadata: { period }
    });
    return { frozen: true, freeze };
  }

  async unfreeze(employeeId: string, query: AdvancedTreatmentQuery, actor: RequestUser) {
    this.ensureCanConfirm(actor);
    const period = normalizePeriod(query);
    const deleted = await this.prisma.advancedTreatmentFreeze.deleteMany({
      where: {
        employeeId,
        periodStart: parseDateKey(period.startDate),
        periodEnd: parseDateKey(period.endDate)
      }
    });
    await this.audit.record({
      userId: actor.id,
      action: "advanced_treatment.unfreeze",
      entityType: "employee",
      entityId: employeeId,
      metadata: { period, count: deleted.count }
    });
    return { frozen: false, deleted: deleted.count };
  }

  async exportConfirmedExcel(query: AdvancedTreatmentQuery, actor: RequestUser) {
    const period = normalizePeriod(query);
    const rows = (await this.computeRows(period, { ...query, riskLevel: undefined }, actor))
      .filter(row => row.confirmed && !row.frozen && matchesCompany(row.employee.company, query.company));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RH Solution";
    const sheet = workbook.addWorksheet("Virement");
    const netPay = normalizeNetPay(query.netPay);
    sheet.columns = [
      { header: "N°", key: "order", width: 8 },
      { header: "Matricule", key: "code", width: 20 },
      { header: "Nom", key: "lastName", width: 22 },
      { header: "Prénom", key: "firstName", width: 22 },
      { header: "Numero de compte", key: "bankAccount", width: 32 },
      { header: "Net à payer", key: "netPay", width: 18 },
      { header: "Société", key: "company", width: 16 }
    ];
    sheet.spliceRows(2, 0, ["VIREMENT ALSALAM AIN MILA 00402", "", "", "", "", rows[0]?.employee.company || "FABCOM"]);
    rows.forEach((row, index) => {
      sheet.addRow({
        order: index + 1,
        code: row.employee.code,
        lastName: row.employee.lastName || firstNamePart(row.employee.fullName),
        firstName: row.employee.firstName || remainingNamePart(row.employee.fullName),
        bankAccount: row.bankAccount ? `'${row.bankAccount}` : "",
        netPay,
        company: row.employee.company || ""
      });
    });
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(2).font = { bold: true };
    sheet.getColumn("bankAccount").numFmt = "@";
    sheet.getColumn("netPay").numFmt = "#,##0.00";
    sheet.eachRow(row => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" }
        };
      });
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportFrozenExcel(query: AdvancedTreatmentQuery, actor: RequestUser) {
    const period = normalizePeriod(query);
    const rows = (await this.computeRows(period, { ...query, riskLevel: undefined }, actor))
      .filter(row => row.frozen);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RH Solution";
    const sheet = workbook.addWorksheet("Refuses");
    sheet.columns = [
      { header: "N°", key: "order", width: 8 },
      { header: "Matricule", key: "code", width: 22 },
      { header: "Employé", key: "employee", width: 30 },
      { header: "Département", key: "department", width: 24 },
      { header: "Embauche", key: "hireDate", width: 14 },
      { header: "Ancienneté", key: "seniority", width: 14 },
      { header: "Pointés", key: "punchedDays", width: 10 },
      { header: "Jours vides", key: "emptyDays", width: 12 },
      { header: "Maladie", key: "sickDays", width: 10 },
      { header: "Congé", key: "leaveDays", width: 10 },
      { header: "Analyse", key: "risk", width: 20 },
      { header: "Gelé par", key: "frozenBy", width: 22 },
      { header: "Date gel", key: "frozenAt", width: 20 }
    ];
    rows.forEach((row, index) => {
      sheet.addRow({
        order: index + 1,
        code: row.employee.code,
        employee: row.employee.fullName,
        department: row.employee.department || "",
        hireDate: row.employee.hireDate ? formatDateForExcel(row.employee.hireDate) : "",
        seniority: `${row.seniorityMonths} mois`,
        punchedDays: row.punchedDays,
        emptyDays: row.emptyDays,
        sickDays: row.sickDays,
        leaveDays: row.leaveDays,
        risk: row.riskLabel,
        frozenBy: row.frozenBy?.fullName || row.frozenBy?.username || "",
        frozenAt: row.frozenAt ? formatDateTimeForExcel(row.frozenAt) : ""
      });
    });
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF4FA" } };
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length }
    };
    sheet.eachRow(row => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" }
        };
        cell.alignment = { vertical: "middle", wrapText: true };
      });
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async refreshSapAccounts(actor: RequestUser) {
    this.ensureCanConfirm(actor);
    const before = await this.prisma.sapEmployeeDirectory.count({ where: { bankAccount: { not: null } } });
    const result = await this.sapDirectory.refresh();
    const after = await this.prisma.sapEmployeeDirectory.count({ where: { bankAccount: { not: null } } });
    await this.audit.record({
      userId: actor.id,
      action: "advanced_treatment.refresh_sap_accounts",
      entityType: "advanced_treatment",
      metadata: { before, after, sapRefresh: result as unknown as Prisma.InputJsonValue }
    });
    return { before, after, refreshed: result.total, linked: result.linked };
  }

  async calendar(employeeId: string, query: AdvancedTreatmentQuery, actor: RequestUser) {
    const period = normalizePeriod(query);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, AND: [employeeScopeWhere(actor)] },
      select: { id: true, fullName: true }
    });
    if (!employee) throw new BadRequestException("Employé introuvable ou hors périmètre.");

    const from = new Date(`${period.startDate}T00:00:00`);
    const toExclusive = new Date(`${addDays(period.endDate, 1)}T00:00:00`);
    const [punches, sickLeaves, leaves] = await Promise.all([
      this.prisma.attendancePunch.findMany({
        where: {
          employeeId,
          punchTime: { gte: from, lt: toExclusive }
        },
        orderBy: { punchTime: "asc" },
        select: { id: true, punchTime: true, rawPayload: true }
      }),
      this.prisma.sickLeaveDeclaration.findMany({
        where: {
          employeeId,
          status: ApprovalStatus.APPROVED,
          dateStart: { lte: parseDateKey(period.endDate) },
          dateEnd: { gte: parseDateKey(period.startDate) }
        },
        select: { employeeId: true, dateStart: true, dateEnd: true }
      }),
      this.prisma.leaveDeclaration.findMany({
        where: {
          employeeId,
          status: ApprovalStatus.APPROVED,
          dateStart: { lte: parseDateKey(period.endDate) },
          dateEnd: { gte: parseDateKey(period.startDate) }
        },
        select: { employeeId: true, dateStart: true, dateEnd: true }
      })
    ]);

    const punchesByDate = new Map<string, AdvancedTreatmentCalendarDay["punches"]>();
    punches.forEach(punch => {
      const date = localDateKey(punch.punchTime);
      const rows = punchesByDate.get(date) || [];
      rows.push({
        id: punch.id,
        punchTime: punch.punchTime.toISOString(),
        punchHour: localTimeKey(punch.punchTime),
        sourceDevice: rawString(punch.rawPayload, ["terminal_alias", "terminal_name", "device_name", "terminal_sn", "sn", "terminal"])
      });
      punchesByDate.set(date, rows);
    });

    const sickDays = declarationCalendarDaysByEmployee(period, sickLeaves).get(employeeId) || new Set<string>();
    const leaveDays = declarationCalendarDaysByEmployee(period, leaves).get(employeeId) || new Set<string>();
    const days = enumerateDateKeys(period.startDate, period.endDate).map<AdvancedTreatmentCalendarDay>(date => {
      const dayPunches = punchesByDate.get(date) || [];
      const sick = sickDays.has(date);
      const leave = leaveDays.has(date);
      return {
        date,
        punches: dayPunches,
        sick,
        leave,
        warning: dayPunches.length > 0 && (sick || leave)
      };
    });

    return {
      employee: { id: employee.id, fullName: employee.fullName },
      periodStart: period.startDate,
      periodEnd: period.endDate,
      stats: {
        daysWithPunches: days.filter(day => day.punches.length > 0).length,
        punchCount: punches.length,
        sickDays: days.filter(day => day.sick).length,
        leaveDays: days.filter(day => day.leave).length,
        warningDays: days.filter(day => day.warning).length,
        periodDays: days.length
      },
      days
    };
  }

  private async computeRows(period: { startDate: string; endDate: string }, query: AdvancedTreatmentQuery, actor: RequestUser): Promise<AdvancedTreatmentRow[]> {
    const where = this.employeeWhere(period, query, actor);
    const employees = await this.prisma.employee.findMany({
      where,
      orderBy: { fullName: "asc" },
      include: {
        group: { include: { subUnit: { include: { unit: true } } } },
        sapDirectoryRecords: { orderBy: { lastSyncedAt: "desc" }, take: 1 }
      }
    });
    const employeeIds = employees.map(employee => employee.id);
    if (!employeeIds.length) return [];

    const from = parseDateKey(period.startDate);
    const toExclusive = parseDateKey(addDays(period.endDate, 1));
    const [punches, sickLeaves, leaves, confirmations, freezes] = await Promise.all([
      this.prisma.attendancePunch.findMany({
        where: {
          employeeId: { in: employeeIds },
          countsAsPresence: true,
          punchTime: { gte: from, lt: toExclusive }
        },
        select: { employeeId: true, punchTime: true }
      }),
      this.prisma.sickLeaveDeclaration.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: ApprovalStatus.APPROVED,
          dateStart: { lte: parseDateKey(period.endDate) },
          dateEnd: { gte: parseDateKey(period.startDate) }
        },
        select: { employeeId: true, dateStart: true, dateEnd: true }
      }),
      this.prisma.leaveDeclaration.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: ApprovalStatus.APPROVED,
          dateStart: { lte: parseDateKey(period.endDate) },
          dateEnd: { gte: parseDateKey(period.startDate) }
        },
        select: { employeeId: true, dateStart: true, dateEnd: true }
      }),
      this.prisma.advancedTreatmentConfirmation.findMany({
        where: {
          employeeId: { in: employeeIds },
          periodStart: parseDateKey(period.startDate),
          periodEnd: parseDateKey(period.endDate)
        },
        include: { confirmedBy: { select: { id: true, username: true, fullName: true } } }
      }),
      this.prisma.advancedTreatmentFreeze.findMany({
        where: {
          employeeId: { in: employeeIds },
          periodStart: parseDateKey(period.startDate),
          periodEnd: parseDateKey(period.endDate)
        },
        include: { frozenBy: { select: { id: true, username: true, fullName: true } } }
      })
    ]);

    const punchDays = new Map<string, Set<string>>();
    punches.forEach(punch => addToMapSet(punchDays, punch.employeeId, toDateKey(punch.punchTime)));
    const sickDays = declarationDaysByEmployee(period, sickLeaves);
    const leaveDays = declarationDaysByEmployee(period, leaves);
    const confirmationByEmployee = new Map(confirmations.map(row => [row.employeeId, row]));
    const freezeByEmployee = new Map(freezes.map(row => [row.employeeId, row]));
    const workDays = enumerateDateKeys(period.startDate, period.endDate).filter(date => !isFriday(date));

    return employees.map(employee => {
      const punched = punchDays.get(employee.id) || new Set<string>();
      const sick = sickDays.get(employee.id) || new Set<string>();
      const leave = leaveDays.get(employee.id) || new Set<string>();
      const justified = new Set([...sick, ...leave]);
      const analyzableDays = workDays.length;
      const emptyDays = workDays.filter(date => !punched.has(date) && !justified.has(date)).length;
      const punchedDays = [...punched].filter(date => date >= period.startDate && date <= period.endDate && !isFriday(date)).length;
      const justifiedDays = [...justified].filter(date => date >= period.startDate && date <= period.endDate && !isFriday(date)).length;
      const riskLevel = classifyRisk(punchedDays, emptyDays, analyzableDays, justifiedDays);
      const confirmation = confirmationByEmployee.get(employee.id);
      const freeze = freezeByEmployee.get(employee.id);
      const frozen = Boolean(freeze);
      const confirmed = Boolean(confirmation) && !frozen;
      const sapRecord = employee.sapDirectoryRecords[0] || null;
      const bankAccount = sapRecord?.bankAccount || null;
      return {
        employee: {
          id: employee.id,
          code: displayMatricule(employee),
          fullName: employee.fullName,
          lastName: sapRecord?.lastName || null,
          firstName: sapRecord?.firstName || null,
          company: sapRecord?.sapCompany || null,
          department: employee.department,
          hireDate: employee.hireDate ? toDateKey(employee.hireDate) : null,
          unitName: employee.group?.subUnit?.unit?.name || null,
          subUnitName: employee.group?.subUnit?.name || null,
          groupName: employee.group?.name || null
        },
        periodStart: period.startDate,
        periodEnd: period.endDate,
        seniorityMonths: employee.hireDate ? monthDiff(employee.hireDate, parseDateKey(period.endDate)) : 0,
        bankAccount,
        punchedDays,
        emptyDays,
        justifiedDays,
        sickDays: sick.size,
        leaveDays: leave.size,
        analyzableDays,
        riskLevel,
        riskLabel: riskLabel(riskLevel),
        confirmed,
        confirmedAt: confirmed ? confirmation?.confirmedAt.toISOString() || null : null,
        confirmedBy: confirmed ? confirmation?.confirmedBy || null : null,
        frozen,
        frozenAt: freeze?.frozenAt.toISOString() || null,
        frozenBy: freeze?.frozenBy || null
      };
    }).sort((left, right) => Number(left.frozen) - Number(right.frozen) || left.employee.fullName.localeCompare(right.employee.fullName));
  }

  private employeeWhere(period: { endDate: string }, filters: AdvancedTreatmentQuery, actor: RequestUser): Prisma.EmployeeWhereInput {
    const end = parseDateKey(period.endDate);
    const threshold = new Date(end);
    threshold.setUTCMonth(threshold.getUTCMonth() - 6);
    const and: Prisma.EmployeeWhereInput[] = [
      employeeScopeWhere(actor),
      { status: EmployeeStatus.ACTIVE },
      { hireDate: { not: null, lte: threshold } }
    ];
    if (filters.groupId) and.push({ groupId: filters.groupId });
    else if (filters.subUnitId) and.push({ group: { subUnitId: filters.subUnitId } });
    else if (filters.unitId) and.push({ group: { subUnit: { unitId: filters.unitId } } });
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
    return { AND: and };
  }

  private ensureCanConfirm(actor: RequestUser) {
    const allowed = new Set<string>([RoleCode.Admin, RoleCode.DRH, RoleCode.GRH]);
    if (!actor.roles.some(role => allowed.has(role))) {
      throw new ForbiddenException("Action réservée à Admin, DRH ou GRH.");
    }
  }
}

function normalizePeriod(query: AdvancedTreatmentQuery) {
  const startDate = validDateKey(query.startDate) ? query.startDate! : "2026-07-26";
  const endDate = validDateKey(query.endDate) ? query.endDate! : "2026-08-14";
  if (startDate > endDate) throw new BadRequestException("La date de début doit être avant la date de fin.");
  return { startDate, endDate };
}

function validDateKey(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function declarationDaysByEmployee(period: { startDate: string; endDate: string }, rows: Array<{ employeeId: string; dateStart: Date; dateEnd: Date }>) {
  const map = new Map<string, Set<string>>();
  rows.forEach(row => {
    const start = toDateKey(row.dateStart) < period.startDate ? period.startDate : toDateKey(row.dateStart);
    const end = toDateKey(row.dateEnd) > period.endDate ? period.endDate : toDateKey(row.dateEnd);
    enumerateDateKeys(start, end).forEach(date => {
      if (!isFriday(date)) addToMapSet(map, row.employeeId, date);
    });
  });
  return map;
}

function declarationCalendarDaysByEmployee(period: { startDate: string; endDate: string }, rows: Array<{ employeeId: string; dateStart: Date; dateEnd: Date }>) {
  const map = new Map<string, Set<string>>();
  rows.forEach(row => {
    const start = toDateKey(row.dateStart) < period.startDate ? period.startDate : toDateKey(row.dateStart);
    const end = toDateKey(row.dateEnd) > period.endDate ? period.endDate : toDateKey(row.dateEnd);
    enumerateDateKeys(start, end).forEach(date => addToMapSet(map, row.employeeId, date));
  });
  return map;
}

function addToMapSet(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key) || new Set<string>();
  set.add(value);
  map.set(key, set);
}

function classifyRisk(punchedDays: number, emptyDays: number, analyzableDays: number, justifiedDays: number) {
  if (punchedDays === 0 && justifiedDays < analyzableDays) return AdvancedTreatmentRiskLevel.HIGH;
  if (emptyDays > 4) return AdvancedTreatmentRiskLevel.MEDIUM;
  return AdvancedTreatmentRiskLevel.LOW;
}

function riskLabel(level: AdvancedTreatmentRiskLevel) {
  if (level === AdvancedTreatmentRiskLevel.HIGH) return "Risque très élevé";
  if (level === AdvancedTreatmentRiskLevel.MEDIUM) return "Risque moyen";
  return "Besoin de confirmation";
}

function displayMatricule(employee: { localMatricule: string | null; biotimeCode: string | null; employeeCode: string; zktecoId: string }) {
  return employee.localMatricule || employee.biotimeCode || employee.employeeCode || employee.zktecoId;
}

function monthDiff(start: Date, end: Date) {
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function isFriday(dateKey: string) {
  return parseDateKey(dateKey).getUTCDay() === 5;
}

function normalizeOptionalText(value?: string | null) {
  const text = value?.trim();
  return text || null;
}

function normalizeNetPay(value?: string) {
  const numeric = Number(String(value || "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 10000;
}

function firstNamePart(value: string) {
  return value.trim().split(/\s+/)[0] || value;
}

function remainingNamePart(value: string) {
  return value.trim().split(/\s+/).slice(1).join(" ");
}

function emptyCompanyStats() {
  return { FABCOM: 0, RECYCLAGE: 0, NEWTECH: 0, OTHER: 0 };
}

function normalizeCompany(value?: string | null): keyof ReturnType<typeof emptyCompanyStats> {
  const text = (value || "").trim().toUpperCase();
  if (text.includes("FABCOM")) return "FABCOM";
  if (text.includes("RECYCLAGE")) return "RECYCLAGE";
  if (text.includes("NEWTECH") || text.includes("NEW TECH")) return "NEWTECH";
  return "OTHER";
}

function matchesCompany(actual?: string | null, expected?: string) {
  if (!expected?.trim()) return true;
  return normalizeCompany(actual) === normalizeCompany(expected);
}

function formatDateForExcel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatDateTimeForExcel(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimeKey(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function rawString(payload: Prisma.JsonValue | null | undefined, keys: string[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() && value.trim() !== "-") return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
