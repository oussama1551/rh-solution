import { Injectable } from "@nestjs/common";
import PDFDocument = require("pdfkit");
import { existsSync } from "fs";
import { resolve as resolvePath, sep } from "path";
import { resolveJobVariables } from "./job-variable-registry";

type PdfSource = {
  reference: string;
  effectiveDate: Date | null;
  majorVersion: number;
  minorVersion: number;
  employeeSnapshot: any;
  companySnapshot: any;
  jobSnapshot: any;
  content: any;
  approvals: Array<any>;
};

@Injectable()
export class JobDescriptionPdfService {
  render(source: PdfSource): Promise<Buffer> {
    const page = source.content?.page || {};
    const landscape = page.orientation === "landscape";
    const document = new PDFDocument({ size: "A4", layout: landscape ? "landscape" : "portrait", margin: 42, bufferPages: true, info: { Title: `Fiche de poste ${source.reference}`, Author: "RH Solution", Subject: "Fiche de poste validée" } });
    const chunks: Buffer[] = [];
    document.on("data", chunk => chunks.push(Buffer.from(chunk)));
    const result = new Promise<Buffer>((resolve, reject) => { document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
    const context = variableContext(source);
    this.header(document, source, context);
    this.identity(document, source, context);
    for (const block of visibleBlocks(source.content)) this.block(document, block, context, source);
    this.addFooters(document, source.reference, `V${source.majorVersion}.${source.minorVersion}`);
    document.end();
    return result;
  }

  private header(document: PDFKit.PDFDocument, source: PdfSource, context: Record<string, unknown>) {
    const company = source.companySnapshot || {};
    const selected = source.jobSnapshot?.selected || {};
    const top = document.y;
    const logoPath = safeLogoPath(company.branding?.relativePath);
    if (logoPath && existsSync(logoPath)) {
      document.roundedRect(42, top, 64, 54, 4).strokeColor("#cbd5e1").stroke();
      document.image(logoPath, 47, top + 5, { fit: [54, 44], align: "center", valign: "center" });
    } else {
      document.roundedRect(42, top, 64, 54, 4).fill(company.primaryColor || "#0f766e");
      document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11).text(String(company.shortName || company.code || "RH").slice(0, 9), 46, top + 20, { width: 56, align: "center" });
    }
    document.fillColor("#0f172a").font("Helvetica-Bold").fontSize(17).text("FICHE DE POSTE", 118, top + 3, { width: 260, align: "center" });
    document.font("Helvetica").fontSize(10).fillColor("#334155").text(String(selected.jobTitle || "Poste"), 118, top + 27, { width: 260, align: "center" });
    const x = document.page.width - 190;
    document.fontSize(8).fillColor("#475569").text(`Référence : ${source.reference}`, x, top + 3, { width: 148 });
    document.text(`Version : V${source.majorVersion}.${source.minorVersion}`, x, top + 19, { width: 148 });
    document.text(`Date d'effet : ${formatDate(source.effectiveDate)}`, x, top + 35, { width: 148 });
    document.moveTo(42, top + 64).lineTo(document.page.width - 42, top + 64).strokeColor(company.primaryColor || "#0f766e").lineWidth(2).stroke();
    document.y = top + 76;
  }

  private identity(document: PDFKit.PDFDocument, source: PdfSource, context: Record<string, unknown>) {
    const employee = source.employeeSnapshot || {};
    const company = source.companySnapshot || {};
    const job = source.jobSnapshot?.selected || {};
    const organization = employee.organization || {};
    const pairs = [
      ["Matricule", employee.matricule], ["Nom et prénom", employee.fullName],
      ["Poste", job.jobTitle], ["Société", company.shortName || company.officialName],
      ["Département", employee.department || organization.subUnit], ["Service / Groupe", organization.group],
      ["Responsable", employee.manager?.fullName], ["Fonction responsable", employee.manager?.jobTitle]
    ];
    const start = document.y;
    const width = (document.page.width - 84) / 2;
    pairs.forEach(([label, value], index) => {
      const column = index % 2; const row = Math.floor(index / 2); const x = 42 + column * width; const y = start + row * 27;
      document.rect(x, y, width, 27).strokeColor("#cbd5e1").lineWidth(.5).stroke();
      document.font("Helvetica").fontSize(7).fillColor("#64748b").text(String(label), x + 6, y + 4, { width: width - 12 });
      document.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text(String(value || "-"), x + 6, y + 14, { width: width - 12, ellipsis: true });
    });
    document.y = start + 118;
  }

  private block(document: PDFKit.PDFDocument, block: any, context: Record<string, unknown>, source: PdfSource) {
    if (["COMPANY_HEADER", "EMPLOYEE_IDENTITY", "JOB_IDENTITY"].includes(block.type)) return;
    if (block.pageBreakBefore) document.addPage();
    this.ensureSpace(document, block.type === "SIGNATURES" ? 190 : 90);
    const color = source.companySnapshot?.primaryColor || "#0f766e";
    document.font("Helvetica-Bold").fontSize(11).fillColor(color).text(String(block.title || "Section"), { underline: false });
    document.moveDown(.35);
    if (block.type === "SEPARATOR") { document.moveTo(42, document.y).lineTo(document.page.width - 42, document.y).strokeColor("#94a3b8").stroke(); document.moveDown(); return; }
    if (block.type === "TASKS") return this.tasks(document, block.content?.items || [], context);
    if (block.type === "KPI") return this.kpis(document, block.content?.items || [], context);
    if (block.type === "SIGNATURES") return this.signatures(document, source);
    if (block.type === "REVISION_HISTORY") return this.revision(document, source);
    const text = resolve(String(block.content?.text || ""), context);
    document.font("Helvetica").fontSize(9).fillColor("#334155").text(text || "—", { lineGap: 3, align: "justify" });
    document.moveDown(.8);
  }

  private tasks(document: PDFKit.PDFDocument, items: any[], context: Record<string, unknown>) {
    if (!items.length) document.font("Helvetica").fontSize(9).fillColor("#64748b").text("Aucune mission renseignée.");
    items.forEach((item, index) => { this.ensureSpace(document, 48); document.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a").text(`${index + 1}. ${resolve(String(item.label || ""), context)}`, { continued: false }); if (item.description) document.font("Helvetica").fontSize(8).fillColor("#475569").text(resolve(String(item.description), context), { indent: 12, lineGap: 2 }); if (item.essential) document.font("Helvetica-Oblique").fontSize(7).fillColor("#b45309").text("Mission essentielle", { indent: 12 }); document.moveDown(.4); });
    document.moveDown(.4);
  }

  private kpis(document: PDFKit.PDFDocument, items: any[], context: Record<string, unknown>) {
    if (!items.length) { document.font("Helvetica").fontSize(9).fillColor("#64748b").text("Aucun KPI renseigné."); return; }
    const widths = [220, 65, 85, 100];
    this.tableRow(document, ["Indicateur", "Unité", "Cible", "Fréquence"], widths, true);
    items.forEach(item => { this.ensureSpace(document, 28); this.tableRow(document, [resolve(String(item.name || item.label || ""), context), item.unit || "-", item.target || "-", item.frequency || "-"], widths, false); });
    document.moveDown(.7);
  }

  private signatures(document: PDFKit.PDFDocument, source: PdfSource) {
    const approvals = source.approvals || [];
    const titles = approvals.length ? approvals.map(row => row.workflowStep?.label || "Validation") : ["Responsable hiérarchique", "Direction RH", "Direction Générale", "Titulaire du poste"];
    const width = (document.page.width - 96) / 2;
    titles.forEach((title, index) => { if (index && index % 2 === 0) document.moveDown(6.8); const x = 42 + (index % 2) * (width + 12); const y = document.y; const approval = approvals[index]; document.roundedRect(x, y, width, 102, 3).strokeColor("#cbd5e1").stroke(); document.font("Helvetica-Bold").fontSize(8).fillColor("#0f172a").text(String(title), x + 7, y + 7, { width: width - 14 }); document.font("Helvetica").fontSize(7.5).fillColor("#475569").text(`Nom : ${approval?.reviewedBy?.fullName || ""}\nDate : ${formatDate(approval?.reviewedAt)}\n\nSignature / Cachet :`, x + 7, y + 26, { width: width - 14, lineGap: 5 }); });
    document.y += 112;
  }

  private revision(document: PDFKit.PDFDocument, source: PdfSource) {
    this.tableRow(document, ["Version", "Date", "Modification", "Auteur"], [65, 90, 245, 130], true);
    this.tableRow(document, [`V${source.majorVersion}.${source.minorVersion}`, formatDate(new Date()), source.majorVersion === 1 && source.minorVersion === 0 ? "Création initiale" : "Révision", source.approvals.at(-1)?.reviewedBy?.fullName || "RH Solution"], [65, 90, 245, 130], false);
    document.moveDown(.7);
  }

  private tableRow(document: PDFKit.PDFDocument, values: unknown[], widths: number[], header: boolean) {
    const y = document.y; let x = 42; const height = 24;
    values.forEach((value, index) => { document.rect(x, y, widths[index], height).fillAndStroke(header ? "#e2e8f0" : "#ffffff", "#cbd5e1"); document.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).fillColor("#0f172a").text(String(value ?? ""), x + 4, y + 7, { width: widths[index] - 8, height: height - 8, ellipsis: true }); x += widths[index]; });
    document.y = y + height;
  }

  private ensureSpace(document: PDFKit.PDFDocument, height: number) { if (document.y + height > document.page.height - 55) document.addPage(); }

  private addFooters(document: PDFKit.PDFDocument, reference: string, version: string) {
    const range = document.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) { document.switchToPage(index); const y = document.page.height - 32; document.moveTo(42, y - 7).lineTo(document.page.width - 42, y - 7).strokeColor("#cbd5e1").lineWidth(.5).stroke(); document.font("Helvetica").fontSize(7).fillColor("#64748b").text(reference, 42, y, { width: 180 }); document.text(version, document.page.width / 2 - 40, y, { width: 80, align: "center" }); document.text(`Page ${index + 1} / ${range.count}`, document.page.width - 142, y, { width: 100, align: "right" }); }
  }
}

function visibleBlocks(content: any) { return (Array.isArray(content?.blocks) ? content.blocks : []).filter((block: any) => block.visible).sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0)); }
function variableContext(source: PdfSource) { const employee = source.employeeSnapshot || {}; const selected = source.jobSnapshot?.selected || {}; return { employee: { ...employee, organization: employee.organization }, company: { ...(source.companySnapshot || {}), name: source.companySnapshot?.shortName || source.companySnapshot?.officialName }, job: { title: selected.jobTitle, code: selected.jobCode, sourceSapTitle: source.jobSnapshot?.source?.sapJobTitle }, manager: employee.manager || {}, document: { reference: source.reference, version: `V${source.majorVersion}.${source.minorVersion}`, effectiveDate: source.effectiveDate } }; }
function resolve(text: string, context: Record<string, unknown>) { return resolveJobVariables(text, context).resolved; }
function formatDate(value: Date | string | null | undefined) { if (!value) return "-"; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("fr-FR").format(date); }
function safeLogoPath(relativePath: unknown) { if (typeof relativePath !== "string" || !relativePath) return null; const root = resolvePath(process.env.JOB_DESCRIPTION_STORAGE_DIR || resolvePath(process.cwd(), "storage", "job-descriptions")); const target = resolvePath(root, relativePath); return target.startsWith(`${root}${sep}`) ? target : null; }
