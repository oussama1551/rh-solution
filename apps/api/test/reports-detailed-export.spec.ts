import * as ExcelJS from "exceljs";
import { ReportsExportService, summaryStatusCode } from "../src/reports/reports-export.service";
import { contractBoundaryStatus } from "../src/reports/attendance-summary.service";
import { AttendanceSummaryStatus } from "@prisma/client";

const summaryRow: any = {
  employee: { id: "emp-1", code: "DEV-1", fullName: "Employé Test", department: "Production", unitName: "FABCOM", subUnitName: null, groupName: null },
  presentDays: 1, absentDays: 1, sickDays: 1, leaveDays: 1, compensatedDays: 1, restDays: 1, incompleteDays: 1, absenceReversedDays: 1,
  contractNotStartedDays: 0, contractEndedDays: 0,
  totalWorkedHours: 8, totalOvertimeHours: 0, overtimeHoursRate50: 0, overtimeHoursRate75: 0, overtimeHoursRate100: 0, lastGeneratedAt: new Date()
};

const statuses = ["PRESENT", "ABSENT", "SICK", "LEAVE", "COMPENSATED", "REST", "INCOMPLETE", "ABSENCE_REVERSED"] as const;
const dailyRows: any[] = statuses.map((status, index) => ({ id: `day-${index}`, employeeId: "emp-1", workDate: `2026-08-${String(index + 1).padStart(2, "0")}`, status }));

describe("detailed payroll summary export", () => {
  it("maps every existing summary status to the requested short code", () => {
    expect(statuses.map(summaryStatusCode)).toEqual(["P", "A", "M", "C", "CP", "R", "I", "SP"]);
    expect(summaryStatusCode("ACCIDENT")).toBe("M");
    expect(summaryStatusCode("CONTRACT_NOT_STARTED")).toBe("DC");
    expect(summaryStatusCode("CONTRACT_ENDED")).toBe("EC");
  });

  it("classifies dates outside a contract without treating legacy employees as outside contract", () => {
    const contracts = [{ startDate: new Date("2026-08-10"), endDate: new Date("2026-08-20") }];
    expect(contractBoundaryStatus([], "2026-08-01")).toBeNull();
    expect(contractBoundaryStatus(contracts, "2026-08-09")).toBe(AttendanceSummaryStatus.CONTRACT_NOT_STARTED);
    expect(contractBoundaryStatus(contracts, "2026-08-10")).toBeNull();
    expect(contractBoundaryStatus(contracts, "2026-08-21")).toBe(AttendanceSummaryStatus.CONTRACT_ENDED);
  });

  it("keeps day columns before totals in Excel and uses aggregate totals", async () => {
    const buffer = await new ReportsExportService().summaryDetailedExcel([summaryRow], dailyRows, "2026-08-01", "2026-08-08");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).values).toEqual(expect.arrayContaining(["01", "08", "Total P", "Total SP"]));
    expect(sheet.getRow(2).getCell(12).value).toBe(1);
  });

  it("generates the detailed PDF on an A3 landscape page", async () => {
    const buffer = await new ReportsExportService().summaryDetailedPdf([summaryRow], dailyRows, "2026-08-01", "2026-08-08");
    expect(buffer.toString("latin1")).toMatch(/\/MediaBox\s*\[0 0 1190\.55\d* 841\.89\d*\]/);
  });
});
