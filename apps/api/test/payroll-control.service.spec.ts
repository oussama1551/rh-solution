import { Prisma } from "@prisma/client";
import { PayrollControlService } from "../src/sap/payroll-control.service";

const actor = { id: "user-1", username: "drh", roles: [], permissions: [] } as any;

function fixture() {
  const employee = { id: "emp-1", fullName: "Employé Test", localMatricule: "FABCOM_DEV-741", biotimeCode: "741", employeeCode: "741", department: "Production", attendanceTrackingExempt: false, attendanceExemptReason: null, group: null, sapDirectoryRecords: [{ sapEmpId: "FABCOM_DEV-741", sapCompany: "FABCOM", biotimeId: "741" }] };
  const prisma = {
    payrollImportLine: { findMany: jest.fn().mockResolvedValue([{ period: "8/2026", company: "FABCOM", sapMatricule: "741", rubricCode: "R100", base: new Prisma.Decimal(2), amount: new Prisma.Decimal(500) }]) },
    employee: { findMany: jest.fn().mockResolvedValue([employee]), findUnique: jest.fn().mockResolvedValue({ id: "emp-1" }) },
    attendancePunch: { findMany: jest.fn().mockResolvedValue([{ employeeId: "emp-1", punchTime: new Date("2026-08-01T08:00:00Z") }]) },
    sickLeaveDeclaration: { findMany: jest.fn().mockResolvedValue([{ employeeId: "emp-1", dateStart: new Date("2026-08-01"), dateEnd: new Date("2026-08-01") }]) },
    leaveDeclaration: { findMany: jest.fn().mockResolvedValue([]) },
    payrollControlConfirmation: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({ id: "confirmation-1" }), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    payrollOperationalReview: { findMany: jest.fn().mockResolvedValue([]) },
    presumedAbsence: { findMany: jest.fn().mockResolvedValue([]) },
    manualAbsenceDeclaration: { findMany: jest.fn().mockResolvedValue([]) },
    attendanceSummaryRecord: { findMany: jest.fn().mockResolvedValue([]) },
    overtimeDeclaration: { findMany: jest.fn().mockResolvedValue([]) }
  };
  const audit = { record: jest.fn() };
  const sap = { listOperationalAbsences: jest.fn().mockResolvedValue([]), listOperationalOvertime: jest.fn().mockResolvedValue([]) };
  return { service: new PayrollControlService(prisma as any, sap as any, audit as any), prisma, sap };
}

describe("PayrollControlService manual workflow", () => {
  it("returns only selected SAP rubric values with informational attendance warnings", async () => {
    const { service } = fixture();
    const result = await service.rows({ period: "8/2026", startDate: "2026-08-01", endDate: "2026-08-05", rubricCodes: "R100", tab: "pending" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.rubricValues.R100).toEqual({ base: 2, amount: 500 });
    expect(result.rows[0]?.punchDays).toBe(1);
    expect(result.rows[0]?.sickDays).toBe(1);
    expect(result.rows[0]?.warnings.punchOnLeaveOrSick).toBe(true);
    expect(result.rows[0]).not.toHaveProperty("diff");
  });

  it("persists and restores manual confirmation for the exact rubric scope", async () => {
    const { service, prisma } = fixture();
    const dto = { employeeId: "emp-1", periodStart: "2026-08-01", periodEnd: "2026-08-05", rubricCodes: "R200,R100" };
    await service.confirm(dto, actor);
    expect(prisma.payrollControlConfirmation.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ employeeId: "emp-1", rubricScope: JSON.stringify(["R100", "R200"]), confirmedById: "user-1" }) }));
    await service.restore(dto, actor);
    expect(prisma.payrollControlConfirmation.deleteMany).toHaveBeenCalled();
  });

  it("keeps an attendance-exempt employee when the SAP bulletin contains a selected rubric", async () => {
    const { service, prisma } = fixture();
    const [employee] = await prisma.employee.findMany();
    prisma.employee.findMany.mockResolvedValue([{ ...employee, attendanceTrackingExempt: true, attendanceExemptReason: "Direction" }]);
    const result = await service.rows({ period: "8/2026", startDate: "2026-08-01", endDate: "2026-08-05", rubricCodes: "R100", tab: "pending" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.employee).toEqual(expect.objectContaining({ linked: true, attendanceTrackingExempt: true, attendanceExemptReason: "Direction" }));
    expect(result.rows[0]?.warnings.manyEmptyDays).toBe(false);
  });

  it("returns SAP bulletin employees even when they are not linked to a local employee", async () => {
    const { service, prisma } = fixture();
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.payrollImportLine.findMany.mockResolvedValue([{ period: "8/2026", company: "FABCOM", sapMatricule: "81200", lastName: "SAP", firstName: "SEUL", rubricCode: "R100", base: new Prisma.Decimal(1), amount: new Prisma.Decimal(250) }]);
    const result = await service.rows({ period: "8/2026", startDate: "2026-08-01", endDate: "2026-08-05", rubricCodes: "R100", tab: "pending" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.employee).toEqual(expect.objectContaining({ id: null, linked: false, code: "FABCOM-81200", fullName: "SAP SEUL" }));
    expect(result.rows[0]?.rubricValues.R100).toEqual({ base: 1, amount: 250 });
  });

  it("does not hide an employee whose selected SAP rubric has base and amount equal to zero", async () => {
    const { service, prisma } = fixture();
    prisma.payrollImportLine.findMany.mockResolvedValue([{ period: "8/2026", company: "FABCOM", sapMatricule: "741", lastName: "ZERO", firstName: "NET", rubricCode: "NET", base: new Prisma.Decimal(0), amount: new Prisma.Decimal(0) }]);
    const result = await service.rows({ period: "8/2026", startDate: "2026-08-01", endDate: "2026-08-05", rubricCodes: "NET", tab: "pending" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.rubricValues.NET).toEqual({ base: 0, amount: 0 });
  });

  it("exports the currently filtered bulletin rows to an Excel workbook", async () => {
    const { service } = fixture();
    const buffer = await service.exportRows({ period: "8/2026", startDate: "2026-08-01", endDate: "2026-08-05", rubricCodes: "R100", tab: "pending" });
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("includes active employees with zero absence in operational mode", async () => {
    const { service } = fixture();
    const result = await service.operationalRows({ period: "8/2026", category: "ABSENCE" });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(expect.objectContaining({ fullName: "Employé Test", absenceDays: 0, absenceHours: 0, absenceTypes: [] }));
  });

  it("warns when an approved manual absence is missing from SAP operational data", async () => {
    const { service, prisma } = fixture();
    prisma.manualAbsenceDeclaration.findMany.mockResolvedValue([{ employeeId: "emp-1", absenceDate: new Date("2026-08-12") }]);

    const result = await service.operationalRows({ period: "8/2026", category: "ABSENCE" });

    expect(result.rows[0]).toEqual(expect.objectContaining({ rhManualAbsenceDays: 1, missingRhAbsenceInSap: true }));
  });

  it("warns from principal Absences over the 26 to 25 payroll window", async () => {
    const { service, prisma } = fixture();
    prisma.attendanceSummaryRecord.findMany.mockResolvedValue([{ employeeId: "emp-1", workDate: new Date("2026-07-30") }]);
    const result = await service.operationalRows({ period: "8/2026", category: "ABSENCE" });
    expect(prisma.attendanceSummaryRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ periodStart: new Date("2026-07-26T00:00:00.000Z"), periodEnd: new Date("2026-08-25T00:00:00.000Z") }) }));
    expect(result.rows[0]).toEqual(expect.objectContaining({ rhPrincipalAbsenceDays: 1, missingRhAbsenceInSap: true }));
  });

  it("compares approved RH overtime with SAP by rate", async () => {
    const { service, prisma, sap } = fixture();
    sap.listOperationalOvertime.mockResolvedValue([{ company: "FABCOM", sapMatricule: "741", workDate: "2026-08-10", hours50: 3, hours75: 1, hours100: 0 }]);
    prisma.overtimeDeclaration.findMany.mockResolvedValue([{ employeeId: "emp-1", date: new Date("2026-08-10"), hours: new Prisma.Decimal(2), rateType: "RATE_50" }, { employeeId: "emp-1", date: new Date("2026-08-10"), hours: new Prisma.Decimal(1), rateType: "RATE_75" }]);
    const result = await service.operationalRows({ period: "8/2026", category: "OVERTIME" });
    expect(result.rows[0]).toEqual(expect.objectContaining({ overtime50: 3, rhOvertime50: 2, overtimeDifference50: 1, overtimeDifference75: 0, overtimeMatches: false }));
  });
});
