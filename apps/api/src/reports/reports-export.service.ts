import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import PDFDocument = require("pdfkit");
import { AbsenceRecapRow, DepartmentReportRow, MonthlyEmployeeReport, SummaryReportRow } from "./reports.types";

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
      { header: "Accident", key: "accidentDays", width: 12 },
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
      String(row.accidentDays),
      String(row.compensatedDays),
      String(row.absenceReversedDays),
      String(row.restDays),
      String(row.incompleteDays),
      `${row.totalWorkedHours} h`,
      `${row.overtimeHoursRate50} h`,
      `${row.overtimeHoursRate75} h`,
      `${row.overtimeHoursRate100} h`
    ]);
    return this.pdf("Rapport de synthèse paie", ["Matricule", "Employé", "Org", "Prés.", "Abs.", "Mal.", "Congé", "Acc.", "Comp.", "Sans preuve", "Repos", "Inc.", "H. trav.", "Sup.50", "Sup.75", "Sup.100"], lines);
  }

  async absenceRecapExcel(rows: AbsenceRecapRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RH Solution";
    const sheet = workbook.addWorksheet("Récap absences");
    sheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Matricule", key: "code", width: 18 },
      { header: "Employé", key: "fullName", width: 28 },
      { header: "Unité", key: "unitName", width: 18 },
      { header: "Sous-unité", key: "subUnitName", width: 24 },
      { header: "Groupe", key: "groupName", width: 20 },
      { header: "Statut", key: "classificationStatus", width: 14 },
      { header: "Code", key: "typeCode", width: 10 },
      { header: "Libellé", key: "typeLabel", width: 28 },
      { header: "Note", key: "note", width: 28 },
      { header: "Classifié par", key: "declaredBy", width: 24 },
      { header: "Approuvé par", key: "approvedBy", width: 24 }
    ];
    rows.forEach(row => sheet.addRow({
      date: row.date,
      code: row.employee.code,
      fullName: row.employee.fullName,
      unitName: row.employee.unitName || "",
      subUnitName: row.employee.subUnitName || "",
      groupName: row.employee.groupName || "",
      classificationStatus: row.classificationStatus === "CONFIRMED" ? "Confirmé" : "En attente",
      typeCode: row.type?.code || "",
      typeLabel: row.type?.label || "",
      note: row.declaration?.note || "",
      declaredBy: row.declaration?.declaredBy?.fullName || row.declaration?.declaredBy?.username || "",
      approvedBy: row.declaration?.approvedBy?.fullName || row.declaration?.approvedBy?.username || ""
    }));
    this.styleWorksheet(sheet);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  absenceRecapPdf(rows: AbsenceRecapRow[]): Promise<Buffer> {
    const lines = rows.map(row => [
      row.date,
      row.employee.code,
      row.employee.fullName,
      [row.employee.unitName, row.employee.subUnitName, row.employee.groupName].filter(Boolean).join(" > ") || "-",
      row.classificationStatus === "CONFIRMED" ? "Confirmé" : "En attente",
      row.type ? `${row.type.code} ${row.type.label}` : "-",
      row.declaration?.declaredBy?.fullName || row.declaration?.declaredBy?.username || "-",
      row.declaration?.approvedBy?.fullName || row.declaration?.approvedBy?.username || "-"
    ]);
    return this.pdf("Récap des absences", ["Date", "Matricule", "Employé", "Org", "Statut", "Type", "Classifié par", "Approuvé par"], lines);
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
