import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import PDFDocument = require("pdfkit");
import { DepartmentReportRow, MonthlyEmployeeReport, SummaryDailyRecordRow, SummaryReportRow } from "./reports.types";

@Injectable()
export class ReportsExportService {
  async employeeMonthlyExcel(rows: MonthlyEmployeeReport[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RH Solution";
    const sheet = workbook.addWorksheet("Présence mensuelle");

    sheet.columns = [
      { header: "Matricule affiché", key: "code", width: 18 },
      { header: "Code BioTime source", key: "sourceCode", width: 18 },
      { header: "Employé", key: "fullName", width: 28 },
      { header: "Département", key: "department", width: 24 },
      { header: "Statut", key: "status", width: 14 },
      { header: "Jours attendus", key: "expectedDays", width: 16 },
      { header: "Présences", key: "presentDays", width: 14 },
      { header: "Absences", key: "absentDays", width: 14 },
      { header: "Retards", key: "lateCount", width: 12 },
      { header: "Minutes retard", key: "lateMinutes", width: 16 },
      { header: "Minutes sup.", key: "overtimeMinutes", width: 16 },
      { header: "Hors-créneau en attente", key: "pending", width: 22 },
      { header: "Hors-créneau validés", key: "validated", width: 22 },
      { header: "Hors-créneau rejetés", key: "rejected", width: 22 }
    ];

    for (const row of rows) {
      sheet.addRow({
        code: row.employee.code,
        sourceCode: row.employee.sourceCode,
        fullName: row.employee.fullName,
        department: row.employee.department || "Sans département",
        status: row.employee.status,
        expectedDays: row.expectedDays,
        presentDays: row.presentDays,
        absentDays: row.absentDays,
        lateCount: row.lateCount,
        lateMinutes: row.lateMinutes,
        overtimeMinutes: row.overtimeMinutes,
        pending: row.outOfWindow.pending,
        validated: row.outOfWindow.validated,
        rejected: row.outOfWindow.rejected
      });
    }

    this.styleWorksheet(sheet);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async departmentExcel(rows: DepartmentReportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RH Solution";
    const sheet = workbook.addWorksheet("Résumé départements");

    sheet.columns = [
      { header: "Département", key: "department", width: 26 },
      { header: "Employés", key: "employeeCount", width: 12 },
      { header: "Jours attendus", key: "expectedDays", width: 16 },
      { header: "Présences", key: "presentDays", width: 14 },
      { header: "Absences", key: "absentDays", width: 14 },
      { header: "Taux présence %", key: "presenceRate", width: 18 },
      { header: "Retards", key: "lateCount", width: 12 },
      { header: "Minutes retard", key: "lateMinutes", width: 16 },
      { header: "Minutes sup.", key: "overtimeMinutes", width: 16 },
      { header: "Flags attente", key: "outOfWindowPending", width: 16 },
      { header: "Flags validés", key: "outOfWindowValidated", width: 16 },
      { header: "Flags rejetés", key: "outOfWindowRejected", width: 16 }
    ];

    rows.forEach(row => sheet.addRow(row));
    this.styleWorksheet(sheet);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  employeeMonthlyPdf(rows: MonthlyEmployeeReport[]): Promise<Buffer> {
    const lines = rows.map(row => [
      row.employee.code,
      row.employee.fullName,
      row.employee.department || "Sans département",
      `Présent ${row.presentDays}/${row.expectedDays}`,
      `Absences ${row.absentDays}`,
      `Retards ${row.lateCount} (${row.lateMinutes} min)`,
      `Sup. ${row.overtimeMinutes} min`,
      `HC ${row.outOfWindow.pending}/${row.outOfWindow.validated}/${row.outOfWindow.rejected}`
    ]);

    return this.pdf("Rapport de présence mensuel", ["Matricule", "Employé", "Département", "Présence", "Abs.", "Retards", "Sup.", "HC P/V/R"], lines);
  }

  departmentPdf(rows: DepartmentReportRow[]): Promise<Buffer> {
    const lines = rows.map(row => [
      row.department,
      String(row.employeeCount),
      `${row.presentDays}/${row.expectedDays}`,
      `${row.presenceRate}%`,
      String(row.absentDays),
      `${row.lateCount} (${row.lateMinutes} min)`,
      `${row.overtimeMinutes} min`,
      `${row.outOfWindowPending}/${row.outOfWindowValidated}/${row.outOfWindowRejected}`
    ]);

    return this.pdf("Rapport global par département", ["Département", "Emp.", "Présence", "Taux", "Abs.", "Retards", "Sup.", "HC P/V/R"], lines);
  }

  async summaryExcel(rows: SummaryReportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RH Solution";
    const sheet = workbook.addWorksheet("Synthèse paie");
    sheet.columns = [
      { header: "Matricule", key: "code", width: 18 },
      { header: "Employé", key: "fullName", width: 28 },
      { header: "Unité", key: "unitName", width: 18 },
      { header: "Sous-unité", key: "subUnitName", width: 24 },
      { header: "Groupe", key: "groupName", width: 20 },
      { header: "Présents", key: "presentDays", width: 12 },
      { header: "Absents", key: "absentDays", width: 12 },
      { header: "Maladie", key: "sickDays", width: 12 },
      { header: "Congé", key: "leaveDays", width: 12 },
      { header: "Compensation", key: "compensatedDays", width: 16 },
      { header: "Sans preuve", key: "absenceReversedDays", width: 16 },
      { header: "Repos", key: "restDays", width: 12 },
      { header: "Incomplets", key: "incompleteDays", width: 14 },
      { header: "Heures travaillées", key: "totalWorkedHours", width: 18 },
      { header: "Heures sup. 50%", key: "overtimeHoursRate50", width: 18 },
      { header: "Heures sup. 75%", key: "overtimeHoursRate75", width: 18 },
      { header: "Heures sup. 100%", key: "overtimeHoursRate100", width: 18 },
      { header: "Total heures sup.", key: "totalOvertimeHours", width: 20 }
    ];
    rows.forEach(row => sheet.addRow({ ...row.employee, ...row }));
    this.styleWorksheet(sheet);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  summaryPdf(rows: SummaryReportRow[]): Promise<Buffer> {
    const lines = rows.map(row => [
      row.employee.code,
      row.employee.fullName,
      [row.employee.unitName, row.employee.subUnitName, row.employee.groupName].filter(Boolean).join(" > ") || "-",
      String(row.presentDays),
      String(row.absentDays),
      String(row.sickDays),
      String(row.leaveDays),
      String(row.compensatedDays),
      String(row.absenceReversedDays),
      String(row.restDays),
      String(row.incompleteDays),
      `${row.totalWorkedHours} h`,
      `${row.overtimeHoursRate50} h`,
      `${row.overtimeHoursRate75} h`,
      `${row.overtimeHoursRate100} h`
    ]);
    return this.pdf("Rapport de synthèse paie", ["Matricule", "Employé", "Org", "Prés.", "Abs.", "Mal.", "Congé", "Comp.", "Sans preuve", "Repos", "Inc.", "H. trav.", "Sup.50", "Sup.75", "Sup.100"], lines);
  }

  async summaryDetailedExcel(rows: SummaryReportRow[], daily: SummaryDailyRecordRow[], startDate: string, endDate: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RH Solution";
    const sheet = workbook.addWorksheet("Synthèse détaillée");
    const dates = dateKeys(startDate, endDate), byDay = dailyStatusMap(daily);
    sheet.columns = [
      { header: "Matricule", key: "code", width: 18 },
      { header: "Nom Prénom", key: "fullName", width: 28 },
      { header: "Structure / Département", key: "structure", width: 30 },
      ...dates.map(date => ({ header: dayLabel(date), key: date, width: 5 })),
      ...["P", "A", "AA", "AI", "AM", "ADC", "DCS", "SAN", "AT", "AMA", "AD", "M", "C", "RC", "R", "I", "DC", "FC"].map(code => ({ header: `Total ${code}`, key: `total${code}`, width: 10 }))
    ];
    for (const row of rows) {
      const codes = dates.map(date => effectiveSummaryCode(byDay.get(`${row.employee.id}:${date}`)));
      sheet.addRow({ code: row.employee.code, fullName: row.employee.fullName, structure: structureLabel(row), ...Object.fromEntries(dates.map((date, index) => [date, codes[index]])), ...Object.fromEntries(["P", "A", "AA", "AI", "AM", "ADC", "DCS", "SAN", "AT", "AMA", "AD", "M", "C", "RC", "R", "I", "DC", "FC"].map(code => [`total${code}`, codes.filter(value => value === code).length])) });
    }
    this.styleWorksheet(sheet);
    sheet.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  summaryDetailedPdf(rows: SummaryReportRow[], daily: SummaryDailyRecordRow[], startDate: string, endDate: string): Promise<Buffer> {
    return new Promise(resolve => {
      const document = new PDFDocument({ size: "A3", margin: 18, layout: "landscape" });
      const chunks: Buffer[] = [];
      document.on("data", chunk => chunks.push(Buffer.from(chunk)));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      const dates = dateKeys(startDate, endDate), byDay = dailyStatusMap(daily), totals = ["P", "A", "AA", "AI", "AM", "ADC", "DCS", "SAN", "AT", "AMA", "AD", "M", "C", "RC", "R", "I", "DC", "FC"];
      const headers = ["Mat.", "Nom Prénom", "Structure", ...dates.map(dayLabel), ...totals.map(code => `T.${code}`)];
      const widths = [46, 92, 104, ...dates.map(() => 18), ...totals.map(() => 22)];
      const drawHeader = () => { document.fontSize(13).text("Rapport de synthèse paie — détaillé", 18, 16); drawPdfRow(document, headers, widths, 38, true); };
      drawHeader();
      let y = 52;
      for (const row of rows) {
        if (y > document.page.height - 28) { document.addPage(); drawHeader(); y = 52; }
        const codes = dates.map(date => effectiveSummaryCode(byDay.get(`${row.employee.id}:${date}`)));
        drawPdfRow(document, [row.employee.code, row.employee.fullName, structureLabel(row), ...codes, ...totals.map(code => String(codes.filter(value => value === code).length))], widths, y, false);
        y += 13;
      }
      document.end();
    });
  }

  private styleWorksheet(sheet: ExcelJS.Worksheet) {
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount }
    };
  }

  private pdf(title: string, headers: string[], rows: string[][]): Promise<Buffer> {
    return new Promise(resolve => {
      const document = new PDFDocument({ size: "A4", margin: 32, layout: "landscape" });
      const chunks: Buffer[] = [];

      document.on("data", chunk => chunks.push(Buffer.from(chunk)));
      document.on("end", () => resolve(Buffer.concat(chunks)));

      document.fontSize(18).text(title, { align: "left" });
      document.moveDown();
      document.fontSize(8);
      document.text(headers.join(" | "));
      document.moveTo(32, document.y + 2).lineTo(810, document.y + 2).stroke();
      document.moveDown(0.6);

      for (const row of rows) {
        if (document.y > 540) {
          document.addPage();
          document.fontSize(8).text(headers.join(" | "));
          document.moveDown(0.6);
        }

        document.text(row.join(" | "), { lineGap: 2 });
      }

      document.end();
    });
  }
}

function dateKeys(startDate: string, endDate: string) { const dates: string[] = [], cursor = new Date(`${startDate}T00:00:00Z`), end = new Date(`${endDate}T00:00:00Z`); while (cursor <= end) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); } return dates; }
function dayLabel(date: string) { return date.slice(8, 10); }
function dailyStatusMap(rows: SummaryDailyRecordRow[]) { return new Map(rows.map(row => [`${row.employeeId}:${row.workDate}`, row])); }
function effectiveSummaryCode(row?: SummaryDailyRecordRow) { return row?.displayCode || summaryStatusCode(row?.status); }
export function summaryStatusCode(status?: SummaryDailyRecordRow["status"]) { return status === "PRESENT" ? "P" : status === "ABSENT" ? "A" : status === "SICK" || status === "ACCIDENT" ? "M" : status === "LEAVE" ? "C" : status === "COMPENSATED" ? "CP" : status === "REST" ? "R" : status === "INCOMPLETE" ? "I" : status === "ABSENCE_REVERSED" ? "SP" : status === "CONTRACT_NOT_STARTED" ? "DC" : status === "CONTRACT_ENDED" ? "FC" : ""; }
function structureLabel(row: SummaryReportRow) { return [row.employee.unitName, row.employee.subUnitName, row.employee.groupName].filter(Boolean).join(" > ") || row.employee.department || "-"; }
function drawPdfRow(document: PDFKit.PDFDocument, values: string[], widths: number[], y: number, header: boolean) { let x = 18; document.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(header ? 5 : 4.5); for (let index = 0; index < values.length; index += 1) { const width = widths[index] || 18; document.rect(x, y, width, 13).strokeColor("#cbd5e1").stroke(); document.fillColor(header ? "#0f172a" : "#334155").text(String(values[index] ?? ""), x + 1, y + 4, { width: width - 2, height: 7, align: index >= 3 ? "center" : "left", ellipsis: true, lineBreak: false }); x += width; } }
