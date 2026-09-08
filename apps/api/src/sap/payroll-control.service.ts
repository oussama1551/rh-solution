import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PayrollMapTarget, Prisma } from "@prisma/client";
import { createHash } from "crypto";
import * as ExcelJS from "exceljs";
import { AuditService } from "../audit/audit.service";
import { employeeScopeWhere, isOwnGroupScoped } from "../common/employee-scope";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { parseDateKey } from "../reports/date-utils";
import { RoleCode } from "../roles/role-codes";
import { PayrollControlConfirmationDto, PayrollControlQueryDto, PayrollOperationalQueryDto, PayrollOperationalReviewDto } from "./dto/payroll-control.dto";
import { SapHanaClientService } from "./sap-client.service";

@Injectable()
export class PayrollControlService {
  constructor(private readonly prisma: PrismaService, private readonly sap: SapHanaClientService, private readonly audit: AuditService) {}

  async importPeriod(period: string, actor: RequestUser) {
    this.ensurePayrollWrite(actor);
    const lines = await this.sap.listPayrollLines(period);
    const now = new Date();
    const distinctRubrics = new Map<string, string | null>();
    for (const line of lines) { const code = String(line.rubricCode || "").trim(); if (code) distinctRubrics.set(code, line.rubricLabel || null); }
    await this.prisma.$transaction(async tx => {
      for (const [rubricCode, rubricLabel] of distinctRubrics) await tx.payrollRubricMapping.upsert({ where: { rubricCode }, update: { rubricLabel: rubricLabel || undefined }, create: { rubricCode, rubricLabel, mapsTo: PayrollMapTarget.IGNORED } });
      await tx.payrollImportLine.deleteMany({ where: { period } });
      if (lines.length) await tx.payrollImportLine.createMany({ data: lines.filter(line => String(line.rubricCode || "").trim()).map(line => ({ period, company: line.company, sapMatricule: String(line.sapMatricule || "").trim(), lastName: line.lastName || null, firstName: line.firstName || null, rubricCode: String(line.rubricCode || "").trim(), rubricLabel: line.rubricLabel || null, base: new Prisma.Decimal(toNumber(line.base)), amount: new Prisma.Decimal(toNumber(line.amount)), rawPayload: line as Prisma.InputJsonValue, importedAt: now })) });
    });
    await this.audit.record({ userId: actor.id, action: "payroll.import", entityType: "payroll_import_lines", metadata: { period, lines: lines.length, rubrics: distinctRubrics.size } as Prisma.InputJsonValue });
    return { period, importedAt: now, lines: lines.length, rubrics: distinctRubrics.size };
  }

  async rubrics(period?: string) {
    const lines = await this.prisma.payrollImportLine.groupBy({ where: period ? { period } : undefined, by: ["rubricCode", "rubricLabel"], _count: { _all: true } });
    const rubrics = new Map<string, { rubricCode: string; rubricLabel: string | null; importCount: number }>();
    for (const row of lines) {
      const current = rubrics.get(row.rubricCode);
      rubrics.set(row.rubricCode, { rubricCode: row.rubricCode, rubricLabel: current?.rubricLabel || row.rubricLabel, importCount: (current?.importCount || 0) + row._count._all });
    }
    return [...rubrics.values()].sort((a, b) => a.rubricCode.localeCompare(b.rubricCode));
  }

  async periods() {
    const rows = await this.prisma.payrollImportLine.groupBy({ by: ["period"], _count: { _all: true } });
    return rows.map(row => ({ period: row.period, lineCount: row._count._all })).sort((a, b) => comparePeriods(b.period, a.period));
  }

  async updateRubric(rubricCode: string, mapsTo: PayrollMapTarget, actor: RequestUser) {
    this.ensurePayrollWrite(actor);
    const row = await this.prisma.payrollRubricMapping.update({ where: { rubricCode }, data: { mapsTo } });
    await this.audit.record({ userId: actor.id, action: "payroll.rubric_mapping.update", entityType: "payroll_rubric_mapping", entityId: row.id, after: row as Prisma.InputJsonValue });
    return row;
  }

  async rows(query: PayrollControlQueryDto) {
    const rubricCodes = normalizeRubrics(query.rubricCodes);
    if (!rubricCodes.length) return this.emptyResult(query, rubricCodes);
    const start = parseDateKey(query.startDate), end = parseDateKey(query.endDate);
    if (end < start) throw new BadRequestException("La date de fin doit etre apres la date de debut.");
    const hash = rubricHash(rubricCodes);
    const [payrollLines, employees, punches, sickLeaves, leaves, confirmations] = await Promise.all([
      this.prisma.payrollImportLine.findMany({ where: { period: query.period, rubricCode: { in: rubricCodes } } }),
      this.prisma.employee.findMany({ select: { id: true, fullName: true, localMatricule: true, biotimeCode: true, employeeCode: true, department: true, attendanceTrackingExempt: true, attendanceExemptReason: true, group: { select: { name: true, subUnit: { select: { name: true, unit: { select: { name: true } } } } } }, sapDirectoryRecords: { select: { sapEmpId: true, sapCompany: true, biotimeId: true } } } }),
      this.prisma.attendancePunch.findMany({ where: { countsAsPresence: true, punchTime: { gte: start, lt: nextDay(end) } }, select: { employeeId: true, punchTime: true } }),
      this.prisma.sickLeaveDeclaration.findMany({ where: { status: "APPROVED", dateStart: { lte: end }, dateEnd: { gte: start } }, select: { employeeId: true, dateStart: true, dateEnd: true } }),
      this.prisma.leaveDeclaration.findMany({ where: { status: "APPROVED", dateStart: { lte: end }, dateEnd: { gte: start } }, select: { employeeId: true, dateStart: true, dateEnd: true } }),
      this.prisma.payrollControlConfirmation.findMany({ where: { periodStart: start, periodEnd: end, rubricHash: hash }, include: { confirmedBy: { select: { id: true, fullName: true, username: true } } } })
    ]);
    const employeeBySapKey = new Map<string, (typeof employees)[number]>();
    for (const employee of employees) {
      for (const record of employee.sapDirectoryRecords) employeeBySapKey.set(`${record.sapCompany}:${extractSapNumber(record.sapEmpId)}`, employee);
      for (const code of [employee.localMatricule, employee.biotimeCode, employee.employeeCode]) if (code) employeeBySapKey.set(`CODE:${extractSapNumber(code)}`, employee);
    }
    const values = new Map<string, Record<string, { base: number; amount: number }>>();
    const sapOnlyValues = new Map<string, { company: string; sapMatricule: string; fullName: string; values: Record<string, { base: number; amount: number }> }>();
    for (const line of payrollLines) {
      const employee = employeeBySapKey.get(`${line.company}:${extractSapNumber(line.sapMatricule)}`) || employeeBySapKey.get(`CODE:${extractSapNumber(line.sapMatricule)}`);
      if (!employee) {
        const sourceKey = `${line.company}:${extractSapNumber(line.sapMatricule)}`;
        const sapOnly = sapOnlyValues.get(sourceKey) || { company: line.company, sapMatricule: String(line.sapMatricule), fullName: [line.lastName, line.firstName].filter(Boolean).join(" ").trim() || "Employé SAP", values: {} };
        const current = sapOnly.values[line.rubricCode] || { base: 0, amount: 0 };
        current.base += Number(line.base); current.amount += Number(line.amount); sapOnly.values[line.rubricCode] = current; sapOnlyValues.set(sourceKey, sapOnly);
        continue;
      }
      const employeeValues = values.get(employee.id) || {}, current = employeeValues[line.rubricCode] || { base: 0, amount: 0 };
      current.base += Number(line.base); current.amount += Number(line.amount); employeeValues[line.rubricCode] = current; values.set(employee.id, employeeValues);
    }
    const punchDates = groupDates(punches.map(row => ({ employeeId: row.employeeId, date: dateKey(row.punchTime) })));
    const sickDates = declarationDates(sickLeaves, start, end), leaveDates = declarationDates(leaves, start, end);
    const confirmationByEmployee = new Map(confirmations.map(row => [row.employeeId, row]));
    const totalDays = daysInclusive(start, end), search = query.search?.trim().toLowerCase();
    const linkedRows = employees.filter(employee => values.has(employee.id)).map(employee => {
      const employeePunchDates = punchDates.get(employee.id) || new Set<string>(), employeeSickDates = sickDates.get(employee.id) || new Set<string>(), employeeLeaveDates = leaveDates.get(employee.id) || new Set<string>();
      const declaredDates = new Set([...employeeSickDates, ...employeeLeaveDates]), overlapCount = [...declaredDates].filter(date => employeePunchDates.has(date)).length;
      const confirmation = confirmationByEmployee.get(employee.id), emptyDays = employee.attendanceTrackingExempt ? 0 : Math.max(0, totalDays - employeePunchDates.size);
      return { employee: { id: employee.id, fullName: employee.fullName, code: employee.localMatricule || employee.biotimeCode || employee.employeeCode, department: employee.department || "-", org: [employee.group?.subUnit?.unit?.name, employee.group?.subUnit?.name, employee.group?.name].filter(Boolean).join(" > ") || "-", linked: true, attendanceTrackingExempt: employee.attendanceTrackingExempt, attendanceExemptReason: employee.attendanceExemptReason || null }, rubricValues: values.get(employee.id) || {}, punchDays: employeePunchDates.size, emptyDays, sickDays: employeeSickDates.size, leaveDays: employeeLeaveDates.size, punchOnLeaveOrSickDays: overlapCount, warnings: { manyEmptyDays: !employee.attendanceTrackingExempt && emptyDays > 4, hasLeaveOrSick: declaredDates.size > 0, punchOnLeaveOrSick: overlapCount > 0 }, confirmedBy: confirmation?.confirmedBy || null, confirmedAt: confirmation?.confirmedAt || null, note: confirmation?.note || null };
    });
    const unlinkedRows = [...sapOnlyValues.values()].map(row => ({ employee: { id: null, fullName: row.fullName, code: `${row.company}-${row.sapMatricule}`, department: "Non lié", org: "Bulletin SAP uniquement", linked: false, attendanceTrackingExempt: false, attendanceExemptReason: null }, rubricValues: row.values, punchDays: 0, emptyDays: 0, sickDays: 0, leaveDays: 0, punchOnLeaveOrSickDays: 0, warnings: { manyEmptyDays: false, hasLeaveOrSick: false, punchOnLeaveOrSick: false }, confirmedBy: null, confirmedAt: null, note: null }));
    const rows = [...linkedRows, ...unlinkedRows].filter(row => (query.tab === "confirmed") === Boolean(row.confirmedAt)).filter(row => !search || `${row.employee.fullName} ${row.employee.code} ${row.employee.department} ${row.employee.org}`.toLowerCase().includes(search)).sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName));
    return { period: query.period, startDate: query.startDate, endDate: query.endDate, rubricCodes, rubricHash: hash, rows, totals: { employees: rows.length } };
  }

  async exportRows(query: PayrollControlQueryDto) {
    const result = await this.rows(query);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RH Solution";
    const sheet = workbook.addWorksheet(query.tab === "confirmed" ? "Confirmés" : "À vérifier");
    sheet.columns = [
      { header: "Employé", key: "employee", width: 30 },
      { header: "Matricule", key: "code", width: 20 },
      { header: "Département", key: "department", width: 24 },
      { header: "Organigramme", key: "org", width: 38 },
      { header: "Liaison", key: "link", width: 22 },
      { header: "Suivi pointage", key: "tracking", width: 22 },
      ...result.rubricCodes.flatMap(code => [
        { header: `${code} - Base`, key: `${code}_base`, width: 16 },
        { header: `${code} - Montant`, key: `${code}_amount`, width: 18 }
      ]),
      { header: "Jours pointés", key: "punchDays", width: 16 },
      { header: "Jours vides", key: "emptyDays", width: 14 },
      { header: "Maladie", key: "sickDays", width: 12 },
      { header: "Congé", key: "leaveDays", width: 12 },
      { header: "Confirmé par", key: "confirmedBy", width: 24 },
      { header: "Confirmé le", key: "confirmedAt", width: 20 }
    ];
    for (const row of result.rows) {
      const values: Record<string, string | number | Date | null> = {
        employee: row.employee.fullName, code: row.employee.code, department: row.employee.department, org: row.employee.org,
        link: row.employee.linked ? "Lié RH/BioTime" : "Bulletin SAP uniquement",
        tracking: row.employee.attendanceTrackingExempt ? "Exclu" : "Suivi actif",
        punchDays: row.employee.linked && !row.employee.attendanceTrackingExempt ? row.punchDays : "-",
        emptyDays: row.employee.linked && !row.employee.attendanceTrackingExempt ? row.emptyDays : "-",
        sickDays: row.sickDays, leaveDays: row.leaveDays,
        confirmedBy: row.confirmedBy?.fullName || row.confirmedBy?.username || "-",
        confirmedAt: row.confirmedAt ? new Date(row.confirmedAt) : null
      };
      for (const code of result.rubricCodes) { values[`${code}_base`] = row.rubricValues[code]?.base ?? 0; values[`${code}_amount`] = row.rubricValues[code]?.amount ?? 0; }
      sheet.addRow(values);
    }
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async operationalRows(query: PayrollOperationalQueryDto, actor?: RequestUser) {
    const { start: periodStart, end: periodEnd, summaryEnd } = operationalPeriodRange(query.period);
    const ownGroupScope = isOwnGroupScoped(actor) || Boolean(actor?.roles.includes(RoleCode.ResponsablePlanningGroupes));
    const operationalEmployeeScope = ownGroupScope ? { group: { createdById: actor!.id } } : employeeScopeWhere(actor);
    const [sourceRows, employees, reviews, confirmedAbsences, manualAbsences, principalAbsences, approvedOvertime] = await Promise.all([
      query.category === "ABSENCE" ? this.sap.listOperationalAbsences(query.period) : this.sap.listOperationalOvertime(query.period),
      this.prisma.employee.findMany({ where: { status: "ACTIVE", attendanceTrackingExempt: false, ...operationalEmployeeScope }, select: { id: true, fullName: true, localMatricule: true, biotimeCode: true, employeeCode: true, department: true, group: { select: { id: true, name: true, createdBy: { select: { id: true, fullName: true, username: true } }, subUnit: { select: { name: true, unit: { select: { name: true } } } } } }, plannedShiftAssignments: { where: { status: "APPROVED", date: { gte: periodStart, lt: periodEnd } }, select: { id: true }, take: 1 }, sapDirectoryRecords: { select: { sapEmpId: true, sapCompany: true } } } }),
      this.prisma.payrollOperationalReview.findMany({ where: { period: query.period, category: query.category }, include: { reviewedBy: { select: { id: true, fullName: true, username: true } } } }),
      query.category === "ABSENCE" ? this.prisma.presumedAbsence.findMany({ where: { status: "CONFIRMED", caseType: "PRESUMED_ABSENCE", date: { gte: periodStart, lt: periodEnd } }, select: { employeeId: true, date: true } }) : Promise.resolve([]),
      query.category === "ABSENCE" ? this.prisma.manualAbsenceDeclaration.findMany({ where: { status: "APPROVED", absenceDate: { gte: periodStart, lt: periodEnd } }, select: { employeeId: true, absenceDate: true } }) : Promise.resolve([]),
      query.category === "ABSENCE" ? this.prisma.attendanceSummaryRecord.findMany({ where: { status: "ABSENT", periodStart, periodEnd: summaryEnd }, select: { employeeId: true, workDate: true } }) : Promise.resolve([]),
      query.category === "OVERTIME" ? this.prisma.overtimeDeclaration.findMany({ where: { status: "APPROVED", date: { gte: periodStart, lt: periodEnd } }, select: { employeeId: true, date: true, hours: true, rateType: true } }) : Promise.resolve([])
    ]);
    const employeeByKey = new Map<string, (typeof employees)[number]>();
    for (const employee of employees) {
      for (const record of employee.sapDirectoryRecords) employeeByKey.set(`${record.sapCompany}:${extractSapNumber(record.sapEmpId)}`, employee);
      for (const code of [employee.localMatricule, employee.biotimeCode, employee.employeeCode]) if (code) employeeByKey.set(`CODE:${extractSapNumber(code)}`, employee);
    }
    const reviewByKey = new Map(reviews.map(row => [row.sourceKey, row]));
    const confirmedByEmployee = countByEmployee(confirmedAbsences);
    const manualByEmployee = countByEmployee(manualAbsences);
    const principalByEmployee = countByEmployee(principalAbsences);
    const rhOvertimeByEmployee = new Map<string, { overtime50: number; overtime75: number; overtime100: number; details: Array<{ date: string; hours50: number; hours75: number; hours100: number; total: number }> }>();
    for (const declaration of approvedOvertime) {
      const current = rhOvertimeByEmployee.get(declaration.employeeId) || { overtime50: 0, overtime75: 0, overtime100: 0, details: [] };
      const hours = Number(declaration.hours); const rateKey = declaration.rateType === "RATE_75" ? "overtime75" : declaration.rateType === "RATE_100" ? "overtime100" : "overtime50";
      current[rateKey] += hours;
      const dayKey = dateKey(declaration.date); let day = current.details.find(row => row.date === dayKey);
      if (!day) { day = { date: dayKey, hours50: 0, hours75: 0, hours100: 0, total: 0 }; current.details.push(day); }
      day[rateKey === "overtime50" ? "hours50" : rateKey === "overtime75" ? "hours75" : "hours100"] += hours; day.total = day.hours50 + day.hours75 + day.hours100;
      rhOvertimeByEmployee.set(declaration.employeeId, current);
    }
    const grouped = new Map<string, any>();
    for (const employee of employees) {
      const sapRecord = employee.sapDirectoryRecords[0];
      const company = sapRecord?.sapCompany || inferCompany(employee.localMatricule || employee.employeeCode || "") || "NON RATTACHÉ";
      const sapMatricule = sapRecord ? extractSapNumber(sapRecord.sapEmpId) : extractSapNumber(employee.localMatricule || employee.biotimeCode || employee.employeeCode || employee.id);
      const sourceKey = sapRecord ? `${sapRecord.sapCompany}:${extractSapNumber(sapRecord.sapEmpId)}` : `LOCAL:${employee.id}`;
      grouped.set(sourceKey, {
        sourceKey, company, sapMatricule, fullName: employee.fullName, localEmployeeId: employee.id,
        department: employee.department || "-", org: [employee.group?.subUnit?.unit?.name, employee.group?.subUnit?.name, employee.group?.name].filter(Boolean).join(" > ") || "-",
        orgKey: employee.group?.id || "", hasOrganigram: Boolean(employee.group), hasPlanning: Boolean(employee.plannedShiftAssignments?.length),
        responsibleId: employee.group?.createdBy?.id || null, responsibleName: employee.group?.createdBy?.fullName || employee.group?.createdBy?.username || null,
        absenceTypes: [], absenceHours: 0, absenceDays: 0, overtimeDates: [], overtimeDetails: [], overtime50: 0, overtime75: 0, overtime100: 0
      });
    }
    for (const raw of sourceRows as any[]) {
      const sourceKey = `${raw.company}:${extractSapNumber(raw.sapMatricule)}`;
      const employee = employeeByKey.get(sourceKey) || employeeByKey.get(`CODE:${extractSapNumber(raw.sapMatricule)}`);
      if (ownGroupScope && !employee) continue;
      const employeeSeedKey = employee ? [...grouped.entries()].find(([, row]) => row.localEmployeeId === employee.id)?.[0] : undefined;
      const current = grouped.get(sourceKey) || (employeeSeedKey ? grouped.get(employeeSeedKey) : null) || {
        sourceKey, company: raw.company, sapMatricule: String(raw.sapMatricule), fullName: employee?.fullName || [raw.lastName, raw.firstName].filter(Boolean).join(" ") || "Employé SAP",
        localEmployeeId: employee?.id || null, department: employee?.department || "-", org: employee ? [employee.group?.subUnit?.unit?.name, employee.group?.subUnit?.name, employee.group?.name].filter(Boolean).join(" > ") || "-" : "Non rattaché",
        orgKey: employee?.group?.id || "", hasOrganigram: Boolean(employee?.group), hasPlanning: Boolean(employee?.plannedShiftAssignments.length),
        responsibleId: employee?.group?.createdBy?.id || null, responsibleName: employee?.group?.createdBy?.fullName || employee?.group?.createdBy?.username || null,
        absenceTypes: [], absenceHours: 0, absenceDays: 0, overtimeDates: [], overtimeDetails: [], overtime50: 0, overtime75: 0, overtime100: 0
      };
      if (employeeSeedKey && employeeSeedKey !== sourceKey) grouped.delete(employeeSeedKey);
      current.sourceKey = sourceKey;
      current.company = raw.company;
      current.sapMatricule = String(raw.sapMatricule);
      if (query.category === "ABSENCE") {
        if (raw.absenceType && !current.absenceTypes.includes(String(raw.absenceType))) current.absenceTypes.push(String(raw.absenceType));
        current.absenceHours += toNumber(raw.hours); current.absenceDays += toNumber(raw.days);
      } else {
        const workDate = raw.workDate ? dateKey(new Date(raw.workDate)) : "";
        if (workDate && !current.overtimeDates.includes(workDate)) current.overtimeDates.push(workDate);
        const existingDay = current.overtimeDetails.find((detail: any) => detail.date === workDate);
        const detail = existingDay || { date: workDate, hours50: 0, hours75: 0, hours100: 0, total: 0 };
        detail.hours50 += toNumber(raw.hours50); detail.hours75 += toNumber(raw.hours75); detail.hours100 += toNumber(raw.hours100); detail.total = detail.hours50 + detail.hours75 + detail.hours100;
        if (!existingDay && workDate) current.overtimeDetails.push(detail);
        current.overtime50 += toNumber(raw.hours50); current.overtime75 += toNumber(raw.hours75); current.overtime100 += toNumber(raw.hours100);
      }
      grouped.set(sourceKey, current);
    }
    const search = query.search?.trim().toLowerCase();
    const rows = [...grouped.values()].map(row => {
      const review = reviewByKey.get(row.sourceKey);
      const rhConfirmedAbsenceDays = row.localEmployeeId ? confirmedByEmployee.get(row.localEmployeeId) || 0 : 0;
      const rhManualAbsenceDays = row.localEmployeeId ? manualByEmployee.get(row.localEmployeeId) || 0 : 0;
      const rhPrincipalAbsenceDays = row.localEmployeeId ? principalByEmployee.get(row.localEmployeeId) || 0 : 0;
      const hasSapAbsence = row.absenceTypes.length > 0 || row.absenceDays > 0 || row.absenceHours > 0;
      const rhOvertime = row.localEmployeeId ? rhOvertimeByEmployee.get(row.localEmployeeId) : undefined;
      const rhOvertime50 = rhOvertime?.overtime50 || 0, rhOvertime75 = rhOvertime?.overtime75 || 0, rhOvertime100 = rhOvertime?.overtime100 || 0;
      const overtimeDifference50 = roundHours(row.overtime50 - rhOvertime50), overtimeDifference75 = roundHours(row.overtime75 - rhOvertime75), overtimeDifference100 = roundHours(row.overtime100 - rhOvertime100);
      return { ...row, rhConfirmedAbsenceDays, rhManualAbsenceDays, rhPrincipalAbsenceDays, missingRhAbsenceInSap: query.category === "ABSENCE" && !hasSapAbsence && rhPrincipalAbsenceDays + rhConfirmedAbsenceDays + rhManualAbsenceDays > 0, rhOvertime50, rhOvertime75, rhOvertime100, rhOvertimeDetails: rhOvertime?.details || [], overtimeDifference50, overtimeDifference75, overtimeDifference100, overtimeMatches: overtimeDifference50 === 0 && overtimeDifference75 === 0 && overtimeDifference100 === 0, verdict: review?.verdict || null, reviewedBy: review?.reviewedBy || null, reviewedAt: review?.reviewedAt || null, note: review?.note || null };
    }).filter(row => !search || `${row.fullName} ${row.sapMatricule} ${row.company} ${row.department} ${row.org}`.toLowerCase().includes(search)).sort((a, b) => a.fullName.localeCompare(b.fullName));
    return { period: query.period, category: query.category, rows, totals: { employees: rows.length, good: rows.filter(row => row.verdict === "GOOD").length, notGood: rows.filter(row => row.verdict === "NOT_GOOD").length, pending: rows.filter(row => !row.verdict).length } };
  }

  async reviewOperational(dto: PayrollOperationalReviewDto, actor: RequestUser) {
    this.ensurePayrollWrite(actor);
    const row = await this.prisma.payrollOperationalReview.upsert({
      where: { sourceKey_period_category: { sourceKey: dto.sourceKey, period: dto.period, category: dto.category } },
      update: { verdict: dto.verdict, reviewedById: actor.id, reviewedAt: new Date(), note: dto.note?.trim() || null },
      create: { sourceKey: dto.sourceKey, period: dto.period, category: dto.category, verdict: dto.verdict, reviewedById: actor.id, note: dto.note?.trim() || null },
      include: { reviewedBy: { select: { id: true, fullName: true, username: true } } }
    });
    await this.audit.record({ userId: actor.id, action: "payroll.operational.review", entityType: "payroll_operational_review", entityId: row.id, metadata: { verdict: dto.verdict, category: dto.category, period: dto.period } as Prisma.InputJsonValue });
    return row;
  }

  async confirm(dto: PayrollControlConfirmationDto, actor: RequestUser) {
    this.ensurePayrollWrite(actor);
    const rubricCodes = normalizeRubrics(dto.rubricCodes);
    if (!rubricCodes.length) throw new BadRequestException("Selectionnez au moins une rubrique SAP.");
    if (!await this.prisma.employee.findUnique({ where: { id: dto.employeeId }, select: { id: true } })) throw new NotFoundException("Employe introuvable.");
    const periodStart = parseDateKey(dto.periodStart), periodEnd = parseDateKey(dto.periodEnd), hash = rubricHash(rubricCodes);
    const row = await this.prisma.payrollControlConfirmation.upsert({ where: { employeeId_periodStart_periodEnd_rubricHash: { employeeId: dto.employeeId, periodStart, periodEnd, rubricHash: hash } }, update: { rubricScope: JSON.stringify(rubricCodes), confirmedById: actor.id, confirmedAt: new Date(), note: dto.note?.trim() || null }, create: { employeeId: dto.employeeId, periodStart, periodEnd, rubricScope: JSON.stringify(rubricCodes), rubricHash: hash, confirmedById: actor.id, note: dto.note?.trim() || null } });
    await this.audit.record({ userId: actor.id, action: "payroll.control.confirm", entityType: "payroll_control_confirmation", entityId: row.id });
    return row;
  }

  async restore(dto: PayrollControlConfirmationDto, actor: RequestUser) {
    this.ensurePayrollWrite(actor);
    const rubricCodes = normalizeRubrics(dto.rubricCodes);
    const result = await this.prisma.payrollControlConfirmation.deleteMany({ where: { employeeId: dto.employeeId, periodStart: parseDateKey(dto.periodStart), periodEnd: parseDateKey(dto.periodEnd), rubricHash: rubricHash(rubricCodes) } });
    await this.audit.record({ userId: actor.id, action: "payroll.control.restore", entityType: "payroll_control_confirmation", metadata: { employeeId: dto.employeeId, periodStart: dto.periodStart, periodEnd: dto.periodEnd, rubricCodes } as Prisma.InputJsonValue });
    return { restored: result.count > 0 };
  }

  private emptyResult(query: PayrollControlQueryDto, rubricCodes: string[]) { return { period: query.period, startDate: query.startDate, endDate: query.endDate, rubricCodes, rubricHash: rubricHash(rubricCodes), rows: [], totals: { employees: 0 } }; }
  private ensurePayrollWrite(actor: RequestUser) {
    const roles = new Set(actor.roles || []);
    if (roles.has(RoleCode.GRH) && !roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH)) throw new ForbiddenException("Le rôle GRH dispose d'un accès en lecture seule au Contrôle paie.");
  }
}

function normalizeRubrics(value: string) { return [...new Set(value.split(",").map(code => code.trim()).filter(Boolean))].sort(); }
function rubricHash(codes: string[]) { return createHash("sha256").update(codes.join("\n")).digest("hex"); }
function toNumber(value: number | string | null | undefined) { return value === null || value === undefined || value === "" ? 0 : Number(value); }
function roundHours(value: number) { return Math.round(value * 100) / 100; }
function extractSapNumber(value: string) { const match = String(value).match(/(\d+)$/); return match ? match[1] : String(value); }
function inferCompany(value: string) { const upper = String(value).toUpperCase(); return upper.includes("FABCOM") ? "FABCOM" : upper.includes("RECYCLAGE") ? "RECYCLAGE" : upper.includes("NEWTECH") ? "NEWTECH" : null; }
function operationalPeriodRange(period: string) { const [month, year] = period.split("/").map(Number); if (!month || !year || month < 1 || month > 12) throw new BadRequestException("Période SAP invalide. Format attendu : M/AAAA."); return { start: new Date(Date.UTC(year, month - 2, 26)), summaryEnd: new Date(Date.UTC(year, month - 1, 25)), end: new Date(Date.UTC(year, month - 1, 26)) }; }
function countByEmployee(rows: Array<{ employeeId: string }>) { const counts = new Map<string, number>(); for (const row of rows) counts.set(row.employeeId, (counts.get(row.employeeId) || 0) + 1); return counts; }
function nextDay(value: Date) { const result = new Date(value); result.setUTCDate(result.getUTCDate() + 1); return result; }
function dateKey(value: Date) { return value.toISOString().slice(0, 10); }
function daysInclusive(start: Date, end: Date) { return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1; }
function groupDates(rows: Array<{ employeeId: string; date: string }>) { const result = new Map<string, Set<string>>(); for (const row of rows) { const dates = result.get(row.employeeId) || new Set<string>(); dates.add(row.date); result.set(row.employeeId, dates); } return result; }
function declarationDates(rows: Array<{ employeeId: string; dateStart: Date; dateEnd: Date }>, start: Date, end: Date) { const result = new Map<string, Set<string>>(); for (const row of rows) { const dates = result.get(row.employeeId) || new Set<string>(), cursor = new Date(row.dateStart > start ? row.dateStart : start), until = row.dateEnd < end ? row.dateEnd : end; while (cursor <= until) { dates.add(dateKey(cursor)); cursor.setUTCDate(cursor.getUTCDate() + 1); } result.set(row.employeeId, dates); } return result; }
function comparePeriods(a: string, b: string) { const [am, ay] = a.split("/").map(Number), [bm, by] = b.split("/").map(Number); return (ay || 0) * 12 + (am || 0) - ((by || 0) * 12 + (bm || 0)); }
