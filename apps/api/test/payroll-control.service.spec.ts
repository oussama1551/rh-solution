import { AttendanceSummaryStatus, PayrollMapTarget, Prisma } from "@prisma/client";
import { PayrollControlService } from "../src/sap/payroll-control.service";

function serviceWith(records: any[], lines: any[]) {
  const prisma = {
    attendanceSummaryRecord: { findMany: jest.fn().mockResolvedValue(records) },
    payrollImportLine: { findMany: jest.fn().mockResolvedValue(lines) },
    payrollRubricMapping: {
      findMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn()
    },
    $transaction: jest.fn(),
    payrollImportLineDelete: jest.fn()
  };
  const sap = { listPayrollLines: jest.fn() };
  const audit = { record: jest.fn() };
  const config = { get: jest.fn().mockReturnValue("0") };
  return new PayrollControlService(prisma as any, sap as any, audit as any, config as any);
}

const employeeOne = {
  id: "emp-1",
  fullName: "Absent RH",
  localMatricule: "FABCOM_DEV-741",
  biotimeCode: "741",
  employeeCode: "741",
  group: null,
  sapDirectoryRecords: [{ sapEmpId: "FABCOM_DEV-741", sapCompany: "FABCOM", biotimeId: "741" }]
};

const employeeTwo = {
  id: "emp-2",
  fullName: "Cohérent",
  localMatricule: "FABCOM_DEV-742",
  biotimeCode: "742",
  employeeCode: "742",
  group: null,
  sapDirectoryRecords: [{ sapEmpId: "FABCOM_DEV-742", sapCompany: "FABCOM", biotimeId: "742" }]
};

describe("PayrollControlService", () => {
  it("detects a RH absence missing from SAP and keeps coherent employee without diff", async () => {
    const service = serviceWith(
      [
        { employeeId: "emp-1", employee: employeeOne, status: AttendanceSummaryStatus.ABSENT, overtimeHoursRate50: new Prisma.Decimal(0), overtimeHoursRate75: new Prisma.Decimal(0), overtimeHoursRate100: new Prisma.Decimal(0) },
        { employeeId: "emp-2", employee: employeeTwo, status: AttendanceSummaryStatus.ABSENT, overtimeHoursRate50: new Prisma.Decimal(0), overtimeHoursRate75: new Prisma.Decimal(0), overtimeHoursRate100: new Prisma.Decimal(0) }
      ],
      [
        {
          period: "7/2026",
          company: "FABCOM",
          sapMatricule: "742",
          base: new Prisma.Decimal(1),
          mapping: { mapsTo: PayrollMapTarget.ABSENCE }
        }
      ]
    );

    const result = await service.compare({ period: "7/2026", startDate: "2026-06-26", endDate: "2026-07-25" });
    const absentRh = result.rows.find(row => row.employee.id === "emp-1");
    const coherent = result.rows.find(row => row.employee.id === "emp-2");

    expect(absentRh?.hasDiff).toBe(true);
    expect(absentRh?.diff.absence).toBe(1);
    expect(coherent?.hasDiff).toBe(false);
  });
});
