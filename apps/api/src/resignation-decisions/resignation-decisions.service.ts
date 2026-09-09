import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { extname, join, resolve } from "path";
import puppeteer from "puppeteer-core";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";

const STORAGE = resolve(process.cwd(), "storage", "resignation-decisions");
const PROFILE_FIELDS = ["fullLegalName", "legalForm", "legalAddress", "capitalSocial", "rcNumber", "nifNumber", "artNumber", "legalPhones", "legalEmail", "legalWebsite", "gerantName", "gerantTitle", "resignationDecisionTemplate"] as const;
export const AVAILABLE_VARIABLES = ["employee_name", "employee_position", "decision_number", "decision_date", "effective_date", "company_legal_name", "gerant_name"];
const DEFAULT_TEMPLATE = `بناء على طلب استقالة السيد(ة) {{employee_name}}،\nوبناء على أحكام القانون رقم 90-11 المتعلق بعلاقات العمل،\nيُقرر\nالمادة الأولى: تُقبل استقالة السيد(ة) {{employee_name}} من منصب {{employee_position}}.\nالمادة الثانية: يسري مفعول هذا القرار ابتداء من {{effective_date}}.\nالمادة الثالثة: يلتزم المعني بإرجاع عتاد الشركة مقابل شهادة العمل ورصيد كل حساب.\nالمادة الرابعة: يكلف مسؤولو الموارد البشرية والإنتاج والمالية بتنفيذ هذا القرار.`;

@Injectable()
export class ResignationDecisionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listUnits(actor: RequestUser) { this.adminOnly(actor); return this.prisma.unit.findMany({ orderBy: { name: "asc" }, select: unitSelect }); }

  async updateUnit(id: string, body: Record<string, unknown>, actor: RequestUser) {
    this.adminOnly(actor);
    const data: Record<string, string | null> = {};
    for (const key of PROFILE_FIELDS) if (key in body) data[key] = typeof body[key] === "string" ? String(body[key]).trim() || null : null;
    const saved = await this.prisma.unit.update({ where: { id }, data, select: unitSelect });
    await this.audit.record({ userId: actor.id, action: "resignation_decision.profile.update", entityType: "unit", entityId: id, after: saved as unknown as Prisma.InputJsonValue });
    return saved;
  }

  async uploadLogo(id: string, file: { buffer: Buffer; mimetype: string; originalname: string }, actor: RequestUser) {
    this.adminOnly(actor); if (!file?.buffer || !["image/png", "image/jpeg"].includes(file.mimetype)) throw new BadRequestException("Logo PNG ou JPEG requis.");
    await mkdir(join(STORAGE, "logos"), { recursive: true });
    const extension = file.mimetype === "image/png" ? ".png" : ".jpg";
    const target = join(STORAGE, "logos", `${id}-${Date.now()}${extension}`); await writeFile(target, file.buffer);
    return this.prisma.unit.update({ where: { id }, data: { legalLogoPath: target }, select: unitSelect });
  }

  async getLogo(id: string) { const row = await this.prisma.unit.findUnique({ where: { id }, select: { legalLogoPath: true } }); if (!row?.legalLogoPath || !existsSync(row.legalLogoPath)) throw new NotFoundException("Logo introuvable."); return { buffer: await readFile(row.legalLogoPath), mime: extname(row.legalLogoPath).toLowerCase() === ".png" ? "image/png" : "image/jpeg" }; }

  async employeeState(employeeId: string, actor: RequestUser) {
    this.generatorOnly(actor); const context = await this.context(employeeId);
    const latest = await this.prisma.resignationDecision.findFirst({ where: { employeeId }, orderBy: { generatedAt: "desc" }, select: decisionSelect });
    return { employee: { id: context.employee.id, name: context.employee.fullName }, unit: { id: context.unit.id, name: context.unit.name }, latest, missingFields: this.missing(context) };
  }

  async generate(employeeId: string, body: { decisionDate?: string; effectiveDate?: string; regenerate?: boolean }, actor: RequestUser) {
    this.generatorOnly(actor);
    const previous = await this.prisma.resignationDecision.findFirst({ where: { employeeId }, orderBy: { generatedAt: "desc" }, select: decisionSelect });
    if (previous && !body.regenerate) return previous;
    const context = await this.context(employeeId); const decisionDate = parseDate(body.decisionDate || isoDate(new Date()), "Date de décision invalide.");
    const effectiveDate = parseDate(body.effectiveDate || (context.employee.resignedAt ? isoDate(context.employee.resignedAt) : isoDate(new Date())), "Date d'effet invalide.");
    const year = decisionDate.getUTCFullYear(); await mkdir(join(STORAGE, "pdf", String(year)), { recursive: true });

    const saved = await this.prisma.$transaction(async tx => {
      const sequence = await tx.$queryRaw<Array<{ last_number: number }>>`INSERT INTO "resignation_decision_sequences" ("id", "unit_id", "year", "last_number", "updated_at") VALUES (${randomUUID()}::uuid, ${context.unit.id}::uuid, ${year}, 1, NOW()) ON CONFLICT ("unit_id", "year") DO UPDATE SET "last_number" = "resignation_decision_sequences"."last_number" + 1, "updated_at" = NOW() RETURNING "last_number"`;
      const number = `${String(sequence[0].last_number).padStart(2, "0")}/DG/RH/${year}`;
      const snapshot = await this.snapshot(context, number, decisionDate, effectiveDate); const html = await this.html(snapshot); const buffer = await this.renderPdf(html);
      const id = randomUUID(); const path = join(STORAGE, "pdf", String(year), `${id}.pdf`); await writeFile(path, buffer);
      return tx.resignationDecision.create({ data: { id, employeeId, unitId: context.unit.id, sequenceYear: year, sequenceNumber: sequence[0].last_number, decisionNumber: number, decisionDate, effectiveDate, generatedById: actor.id, pdfFilePath: path, documentSnapshot: snapshot as unknown as Prisma.InputJsonValue }, select: decisionSelect });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 45_000 });
    await this.audit.record({ userId: actor.id, action: "resignation_decision.generate", entityType: "resignation_decision", entityId: saved.id, metadata: { decisionNumber: saved.decisionNumber, employeeId, regeneration: Boolean(body.regenerate) } });
    return saved;
  }

  async pdf(id: string, actor: RequestUser) { this.generatorOnly(actor); const row = await this.prisma.resignationDecision.findUnique({ where: { id } }); if (!row || !existsSync(row.pdfFilePath)) throw new NotFoundException("PDF historique introuvable."); return { buffer: await readFile(row.pdfFilePath), number: row.decisionNumber }; }

  private async context(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, include: { group: { include: { subUnit: { include: { unit: true } } } } } });
    if (!employee || employee.status !== "RESIGNED") throw new BadRequestException("L'employé doit être démissionné."); const unit = employee.group?.subUnit.unit;
    if (!unit) throw new BadRequestException("Société introuvable dans l'organigramme de l'employé."); return { employee, unit };
  }
  private missing(c: Awaited<ReturnType<ResignationDecisionsService["context"]>>) { const missing: string[] = []; if (!c.unit.fullLegalName) missing.push("company_legal_name"); if (!c.unit.gerantName) missing.push("gerant_name"); if (!position(c.employee.sourcePayload)) missing.push("employee_position"); if (!c.unit.resignationDecisionTemplate) missing.push("resignation_decision_template"); if (!c.unit.legalLogoPath) missing.push("logo"); return missing; }
  private async snapshot(c: Awaited<ReturnType<ResignationDecisionsService["context"]>>, number: string, decisionDate: Date, effectiveDate: Date) { const vars: Record<string,string> = { employee_name: c.employee.fullName || "___", employee_position: position(c.employee.sourcePayload) || "___", decision_number: number, decision_date: formatDate(decisionDate), effective_date: formatDate(effectiveDate), company_legal_name: c.unit.fullLegalName || c.unit.name || "___", gerant_name: c.unit.gerantName || "___" }; const template = c.unit.resignationDecisionTemplate || DEFAULT_TEMPLATE; return { vars, content: substituteVariables(template, vars), unit: Object.fromEntries(["name", "fullLegalName", "legalForm", "legalAddress", "capitalSocial", "rcNumber", "nifNumber", "artNumber", "legalPhones", "legalEmail", "legalWebsite", "gerantName", "gerantTitle"].map(k => [k, (c.unit as any)[k] || "___"])), logo: c.unit.legalLogoPath && existsSync(c.unit.legalLogoPath) ? `data:${extname(c.unit.legalLogoPath) === ".png" ? "image/png" : "image/jpeg"};base64,${(await readFile(c.unit.legalLogoPath)).toString("base64")}` : null };
  }
  private async html(s: any) { const fontPath = "C:\\Windows\\Fonts\\arial.ttf"; const font = existsSync(fontPath) ? (await readFile(fontPath)).toString("base64") : ""; return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>@font-face{font-family:ArabicLocal;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}body{font-family:ArabicLocal,Arial,sans-serif;direction:rtl;margin:24mm 18mm;font-size:14px;line-height:1.85;color:#111}.header{display:grid;grid-template-columns:150px 1fr;direction:ltr;border-bottom:2px solid #222;padding-bottom:12px}.logo{max-width:135px;max-height:85px}.legal{direction:rtl;text-align:right;font-size:10px;line-height:1.45}.titles{text-align:center;margin:22px 0 16px}.titles h2,.titles h3{margin:2px}.content{white-space:pre-wrap;text-align:justify;font-size:16px}.footer{margin-top:30px;display:flex;justify-content:space-between}.signature{text-align:center;min-width:220px}</style></head><body><header class="header"><div>${s.logo ? `<img class="logo" src="${s.logo}">` : ""}</div><div class="legal"><strong>${esc(s.unit.fullLegalName)}</strong><br>${esc(s.unit.legalForm)} — ${esc(s.unit.legalAddress)}<br>رأس المال: ${esc(s.unit.capitalSocial)} | س.ت: ${esc(s.unit.rcNumber)} | ن.ت: ${esc(s.unit.nifNumber)} | ر.ج: ${esc(s.unit.artNumber)}<br>${esc(s.unit.legalPhones)} | ${esc(s.unit.legalEmail)} | ${esc(s.unit.legalWebsite)}</div></header><section class="titles"><h3>المديرية العامة</h3><h3>مديرية الموارد البشرية</h3><h2>قرار رقم ${esc(s.vars.decision_number)}</h2><h2>قرار الاستقالة</h2></section><main class="content">${esc(s.content)}</main><footer class="footer"><div>نسخة: المعني، ملف المعني</div><div class="signature">${esc(s.unit.gerantTitle)}<br><strong>${esc(s.unit.gerantName)}</strong></div></footer></body></html>`; }
  private async renderPdf(html: string) { const executablePath = chromePath(); const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }); try { const page = await browser.newPage(); await page.setContent(html, { waitUntil: "load" }); return Buffer.from(await page.pdf({ format: "A4", printBackground: true })); } finally { await browser.close(); } }
  private adminOnly(actor: RequestUser) { if (!actor.roles.includes("ADMIN")) throw new ForbiddenException("Paramétrage réservé à Admin."); }
  private generatorOnly(actor: RequestUser) { if (!actor.roles.some(r => r === "ADMIN" || r === "DRH")) throw new ForbiddenException("Génération réservée à Admin et DRH."); }
}

const unitSelect = { id: true, name: true, code: true, legalLogoPath: true, fullLegalName: true, legalForm: true, legalAddress: true, capitalSocial: true, rcNumber: true, nifNumber: true, artNumber: true, legalPhones: true, legalEmail: true, legalWebsite: true, gerantName: true, gerantTitle: true, resignationDecisionTemplate: true } as const;
const decisionSelect = { id: true, decisionNumber: true, decisionDate: true, effectiveDate: true, generatedAt: true, generatedBy: { select: { fullName: true, username: true } } } as const;
export function substituteVariables(template: string, vars: Record<string,string>) { return template.replace(/{{\s*([a-z_]+)\s*}}/gi, (_, key) => vars[key] || "___"); }
function position(payload: unknown) { const p = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}; for (const key of ["position_name", "position", "job_title", "title", "designation"]) if (typeof p[key] === "string" && p[key]) return String(p[key]); return null; }
function parseDate(value: string, message: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(message); const d = new Date(`${value}T00:00:00.000Z`); if (Number.isNaN(d.getTime())) throw new BadRequestException(message); return d; }
function isoDate(d: Date) { return d.toISOString().slice(0,10); } function formatDate(d: Date) { return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC" }).format(d); }
function esc(v: unknown) { return String(v ?? "___").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!)); }
function chromePath() { const candidates = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"]; const found = candidates.find(existsSync); if (!found) throw new BadRequestException("Chrome ou Edge est requis sur le serveur pour générer le PDF."); return found; }
