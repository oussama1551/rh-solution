import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PayrollMapTarget, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { parseDateKey } from "../reports/date-utils";
import { SapHanaClientService } from "./sap-client.service";
import { PayrollControlQueryDto } from "./dto/payroll-control.dto";

type Category = "absence" | "overtime50" | "overtime75" | "overtime100" | "sick" | "compensation";

type CategoryValues = Record<Category, number>;

const ZERO_VALUES: CategoryValues = {
  absence: 0,
  overtime50: 0,
  overtime75: 0,
  overtime100: 0,
  sick: 0,
  compensation: 0
};

@Injectable()
export class PayrollControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sap: SapHanaClientService,
    private readonly audit: AuditService,
    private readonly config: ConfigService
  ) {}

  async importPeriod(period: string, actor: RequestUser) {
    const lines = await this.sap.listPayrollLines(period);
    const now = new Date();
    const distinctRubrics = new Map<string, string | null>();
    for (const line of lines) {
      const code = String(line.rubricCode || "").trim();
      if (code) distinctRubrics.set(code, line.rubricLabel || null);
    }

    await this.prisma.$transaction(async tx => {
      for (const [rubricCode, rubricLabel] of distinctRubrics) {
        await tx.payrollRubricMapping.upsert({
          where: { rubricCode },
          update: { rubricLabel: rubricLabel || undefined },
          create: { rubricCode, rubricLabel, mapsTo: PayrollMapTarget.IGNORED }
        });
      }

      await tx.payrollImportLine.deleteMany({ where: { period } });
      if (lines.length) {
        await tx.payrollImportLine.createMany({
          data: lines
            .filter(line => String(line.rubricCode || "").trim())
            .map(line => ({
              period,
              company: line.company,
              sapMatricule: String(line.sapMatricule || "").trim(),
              lastName: line.lastName || null,
              firstName: line.firstName || null,
              rubricCode: String(line.rubricCode || "").trim(),
              rubricLabel: line.rubricLabel || null,
              base: new Prisma.Decimal(toNumber(line.base)),
              amount: new Prisma.Decimal(toNumber(line.amount)),
              rawPayload: line as Prisma.InputJsonValue,
              importedAt: now
            }))
        });
      }
    });

    await this.audit.record({
      userId: actor.id,
      action: "payroll.import",
      entityType: "payroll_import_lines",
      metadata: { period, lines: lines.length, rubrics: distinctRubrics.size } as Prisma.InputJsonValue
    });

    return { period, importedAt: now, lines: lines.length, rubrics: distinctRubrics.size };
  }

  async rubrics() {
    const [mappings, counts] = await Promise.all([
      this.prisma.payrollRubricMapping.findMany({ orderBy: [{ mapsTo: "asc" }, { rubricCode: "asc" }] }),
      this.prisma.payrollImportLine.groupBy({ by: ["rubricCode"], _count: { _all: true } })
    ]);
    const countByCode = new Map(counts.map(row => [row.rubricCode, row._count._all]));
    return mappings.map(mapping => ({
      ...mapping,
      mapsTo: mapping.mapsTo === PayrollMapTarget.ACCIDENT ? PayrollMapTarget.SICK : mapping.mapsTo,
      importCount: countByCode.get(mapping.rubricCode) || 0
    }));
  }

  async updateRubric(rubricCode: string, mapsTo: PayrollMapTarget, actor: RequestUser) {
    const row = await this.prisma.payrollRubricMapping.update({
      where: { rubricCode },
      data: { mapsTo }
    });
    await this.audit.record({ userId: actor.id, action: "payroll.rubric_mapping.update", entityType: "payroll_rubric_mapping", entityId: row.id, after: row as Prisma.InputJsonValue });
    return row;
  }

  async compare(query: PayrollControlQueryDto) {
    const start = parseDateKey(query.startDate);
    const end = parseDateKey(query.endDate);
    const [summaryRecords, payrollLines] = await Promise.all([
      this.prisma.attendanceSummaryRecord.findMany({
        where: { periodStart: start, periodEnd: end },
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              localMatricule: true,
              biotimeCode: true,
              employeeCode: true,
              group: { select: { name: true, subUnit: { select: { name: true, unit: { select: { name: true } } } } } },
              sapDirectoryRecords: { select: { sapEmpId: true, sapCompany: true, biotimeId: true } }
            }
          }
        }
      }),
      this.prisma.payrollImportLine.findMany({
        where: { period: query.period },
        include: { mapping: true }
      })
    ]);

    const employeeById = new Map<string, (typeof summaryRecords)[number]["employee"]>();
    const rhByEmployee = new Map<string, CategoryValues>();
    for (const record of summaryRecords) {
      employeeById.set(record.employeeId, record.employee);
      const current = rhByEmployee.get(record.employeeId) || cloneValues();
      if (record.status === "ABSENT") current.absence += 1;
      if (record.status === "SICK" || record.status === "ACCIDENT") current.sick += 1;
      if (record.status === "COMPENSATED") current.compensation += 1;
      current.overtime50 += Number(record.overtimeHoursRate50);
      current.overtime75 += Number(record.overtimeHoursRate75);
      current.overtime100 += Number(record.overtimeHoursRate100);
      rhByEmployee.set(record.employeeId, current);
    }

    const sapKeyToEmployeeId = new Map<string, string>();
    for (const employee of employeeById.values()) {
      for (const record of employee.sapDirectoryRecords) {
        sapKeyToEmployeeId.set(`${record.sapCompany}:${extractSapNumber(record.sapEmpId)}`, employee.id);
        if (record.biotimeId) sapKeyToEmployeeId.set(`BIOTIME:${record.biotimeId}`, employee.id);
      }
      for (const code of [employee.localMatricule, employee.biotimeCode, employee.employeeCode]) {
        if (code) sapKeyToEmployeeId.set(`CODE:${extractSapNumber(code)}`, employee.id);
      }
    }

    const sapByEmployee = new Map<string, CategoryValues>();
    for (const line of payrollLines) {
      if (line.mapping.mapsTo === PayrollMapTarget.IGNORED) continue;
      const employeeId = sapKeyToEmployeeId.get(`${line.company}:${line.sapMatricule}`)
        || sapKeyToEmployeeId.get(`CODE:${line.sapMatricule}`);
      if (!employeeId) continue;
      const current = sapByEmployee.get(employeeId) || cloneValues();
      addMappedValue(current, line.mapping.mapsTo, Number(line.base));
      sapByEmployee.set(employeeId, current);
    }

    const tolerance = Number(this.config.get("PAYROLL_CONTROL_TOLERANCE") || 0);
    const ids = new Set([...rhByEmployee.keys(), ...sapByEmployee.keys()]);
    const rows = [...ids].map(employeeId => {
      const employee = employeeById.get(employeeId);
      const rh = rhByEmployee.get(employeeId) || cloneValues();
      const sap = sapByEmployee.get(employeeId) || cloneValues();
      const diff = cloneValues();
      (Object.keys(diff) as Category[]).forEach(key => {
        diff[key] = round2(rh[key] - sap[key]);
      });
      const hasDiff = (Object.keys(diff) as Category[]).some(key => Math.abs(diff[key]) > tolerance);
      return {
        employee: {
          id: employeeId,
          code: employee ? employee.localMatricule || employee.biotimeCode || employee.employeeCode : "-",
          fullName: employee?.fullName || "Employé non rattaché",
          org: employee ? [employee.group?.subUnit?.unit?.name, employee.group?.subUnit?.name, employee.group?.name].filter(Boolean).join(" > ") || "-" : "-"
        },
        rh,
        sap,
        diff,
        hasDiff
      };
    });

    const search = query.search?.trim().toLowerCase();
    const filtered = rows
      .filter(row => !search || `${row.employee.code} ${row.employee.fullName} ${row.employee.org}`.toLowerCase().includes(search))
      .filter(row => query.onlyDiff === "true" ? row.hasDiff : true)
      .sort((a, b) => Number(b.hasDiff) - Number(a.hasDiff) || a.employee.fullName.localeCompare(b.employee.fullName));

    return {
      period: query.period,
      startDate: query.startDate,
      endDate: query.endDate,
      tolerance,
      rows: filtered,
      totals: {
        employees: filtered.length,
        withDiff: filtered.filter(row => row.hasDiff).length
      }
    };
  }

  async csv(query: PayrollControlQueryDto) {
    const result = await this.compare(query);
    const headers = [
      "Matricule", "Employé", "Organigramme", "Écart",
      "RH Abs", "SAP Abs", "Diff Abs",
      "RH Maladie", "SAP Maladie", "Diff Maladie",
      "RH Comp", "SAP Comp", "Diff Comp",
      "RH Sup50", "SAP Sup50", "Diff Sup50",
      "RH Sup75", "SAP Sup75", "Diff Sup75",
      "RH Sup100", "SAP Sup100", "Diff Sup100"
    ];
    const lines = result.rows.map(row => [
      row.employee.code,
      row.employee.fullName,
      row.employee.org,
      row.hasDiff ? "OUI" : "NON",
      row.rh.absence, row.sap.absence, row.diff.absence,
      row.rh.sick, row.sap.sick, row.diff.sick,
      row.rh.compensation, row.sap.compensation, row.diff.compensation,
      row.rh.overtime50, row.sap.overtime50, row.diff.overtime50,
      row.rh.overtime75, row.sap.overtime75, row.diff.overtime75,
      row.rh.overtime100, row.sap.overtime100, row.diff.overtime100
    ]);
    return [headers, ...lines].map(row => row.map(csvCell).join(";")).join("\n");
  }
}

function cloneValues(): CategoryValues {
  return { ...ZERO_VALUES };
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value);
}

function addMappedValue(values: CategoryValues, target: PayrollMapTarget, base: number) {
  if (target === PayrollMapTarget.ABSENCE) values.absence += base;
  if (target === PayrollMapTarget.OVERTIME_50) values.overtime50 += base;
  if (target === PayrollMapTarget.OVERTIME_75) values.overtime75 += base;
  if (target === PayrollMapTarget.OVERTIME_100) values.overtime100 += base;
  if (target === PayrollMapTarget.SICK || target === PayrollMapTarget.ACCIDENT) values.sick += base;
  if (target === PayrollMapTarget.COMPENSATION) values.compensation += base;
}

function extractSapNumber(value: string) {
  const match = value.match(/(\d+)$/);
  return match ? match[1] : value;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
