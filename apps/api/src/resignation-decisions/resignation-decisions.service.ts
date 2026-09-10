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
const PROFILE_FIELDS = ["fullLegalName", "legalForm", "legalAddress", "capitalSocial", "rcNumber", "nifNumber", "artNumber", "legalPhones", "legalEmail", "legalWebsite", "gerantName", "gerantTitle", "resignationDecisionTemplate", "positionChangeDecisionTemplate"] as const;
const DECISION_TYPES = ["RESIGNATION", "POSITION_CHANGE"] as const;
type DecisionType = typeof DECISION_TYPES[number];
export const AVAILABLE_VARIABLES = ["employee_name", "employee_position", "employee_number", "new_position", "grade", "category", "decision_title", "decision_number", "decision_number_ar", "decision_sequence", "decision_year", "decision_date", "hire_date", "contract_date", "request_date", "effective_date", "effective_date_ar", "company_legal_name", "gerant_name"];
export const DEFAULT_RESIGNATION_DECISION_TEMPLATE = `المديريــــــــــــــة العامـــــــــــــــة
مديريـــــــــة الموارد البشريـــــــــة
رقم {{decision_sequence}} / م ع/ م م ب/{{decision_year}}
قـــــــرار الاستقالـــة

- بمقتضى عقد تأسيس الشركة رقم 40/2011 الصادر في 10/01/2011 المتضمن انشاء شركة ذات المسؤولية المحدودة "فابكوم"
- بمقتضى عقد تعديل القانون الأساسي للشركة رقم 970/2017 الصادر في 21 و 25/12/2017 المتضمن تعيين السيد: عطية عصام مسير لشركة فابكوم ش.ذ.م.م
- بمقتضى القانون 90-11 في 23/04/1990 والمتعلق بعلاقات العمل سيما المادة 12.
- بناء على النظام الداخلي للمؤسسة المؤرخ في 20 مارس 2022.
- بمقتضى احكام المواد 12 و13 من عقد عمل المعني المؤرخ في {{contract_date}}
- بناء على طلب المعني الاستقالة من منصب عمله المؤرخ في {{request_date}}
- بناء على قبولنا.

يقـــــــــــــــــــــــــــــــــرر

المادة 01: يوافق على استقالة السيد {{employee_name}} من منصب {{employee_position}}.
المادة 02: يسرى مفعول هذا القرار ابتداء من تاريخ {{effective_date_ar}}
المادة 03: يلتزم المعني بإعادة معدات الشركة التي في حوزته مقابل استفادته من شهادة العمل وتصفية كل الحساب
المادة 04: يكلف مدير الموارد البشرية ومسؤول الإنتاج ومسؤول المالية والمحاسبة بتنفيذ هذا القرار.

نسخة:
المعنـــــــي
ملف المعني

مسير الشركة
{{gerant_name}}`;
export const DEFAULT_POSITION_CHANGE_DECISION_TEMPLATE = `المديريــــــــــــــة العامـــــــــــــــة
مديريـــــــــة الموارد البشريـــــــــة
رقم {{decision_sequence}} / م ع/ م م ب/{{decision_year}}
قـــــــرار

- بمقتضى عقد تأسيس الشركة رقم 40/2011 الصادر في 10/01/2011 المتضمن انشاء شركة ذات المسؤولية المحدودة "فابكوم"
- بمقتضى عقد تعديل القانون الأساسي للشركة رقم 970/2017 الصادر في 21 و 25/12/2017 المتضمن تعيين السيد: عطية عصام مسير لشركة فابكوم ش.ذ.م.م
- بمقتضى القانون 90-11 في 23/04/1990 والمتعلق بعلاقات العمل سيما المادة 12.
- بناء على النظام الداخلي للمؤسسة المؤرخ في 20 مارس 2022.
- بناء على طلب تغيير المنصب للسيد: {{employee_name}}.

يقـــــــــــــــــــــــــــــــــرر

المادة 01: السيد/السيدة: {{employee_name}}، المنصب: {{employee_position}}، الرقم الوظيفي {{employee_number}}
تاريخ التوظيف: {{hire_date}}، يتغير الى منصب {{new_position}}، الدرجة {{grade}} الصنف {{category}}.
المادة 02: يسرى مفعول هذا القرار ابتداء من تاريخ {{effective_date}}.
المادة 03: يكلف مدير الموارد البشرية ومسؤول الإنتاج ومسؤول المالية والمحاسبة بتنفيذ هذا القرار.

مسير الشركة
{{gerant_name}}`;

type DecisionGenerateBody = { decisionType?: string; decisionDate?: string; effectiveDate?: string; requestDate?: string; regenerate?: boolean; overrides?: DecisionOverrides };
type DecisionOverrides = { employeeName?: string; employeePosition?: string; employeeNumber?: string; newPosition?: string; grade?: string; category?: string; hireDate?: string; contractDate?: string; requestDate?: string; effectiveDate?: string; gerantName?: string };
type EmployeeCompanyFallback = { localMatricule: string | null; employeeCode: string; biotimeCode: string | null; sapDirectoryRecords: Array<{ sapCompany: string }> };

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

  async employeeState(employeeId: string, actor: RequestUser, requestedType?: string) {
    this.generatorOnly(actor); const decisionType = normalizeDecisionType(requestedType); const context = await this.context(employeeId, decisionType);
    const latest = await this.prisma.resignationDecision.findFirst({ where: { employeeId, decisionType }, orderBy: { generatedAt: "desc" }, select: decisionSelect });
    return { employee: { id: context.employee.id, name: context.employee.fullName }, unit: { id: context.unit.id, name: context.unit.name }, latest, missingFields: this.missing(context, decisionType) };
  }

  async preview(employeeId: string, actor: RequestUser, requestedType?: string) {
    this.generatorOnly(actor);
    const decisionType = normalizeDecisionType(requestedType);
    const context = await this.context(employeeId, decisionType);
    const history = await this.prisma.resignationDecision.findMany({ where: { employeeId, decisionType }, orderBy: { generatedAt: "desc" }, take: 6, select: decisionSelect });
    const decisionDate = new Date();
    const effectiveDate = context.employee.resignedAt || context.employee.resignRecords[0]?.resignDate || decisionDate;
    const sap = context.employee.sapDirectoryRecords[0] || null;
    const sapNameAr = sapArabicName(sap?.rawPayload);
    const contractDate = contractStart(context.employee.contracts, effectiveDate) || sap?.hireDate || context.employee.hireDate || decisionDate;
    const hireDate = sap?.hireDate || context.employee.hireDate || contractDate;
    const biotimePosition = position(context.employee.sourcePayload);
    const employeeNumber = displayEmployeeNumber(context.employee, sap);
    return {
      employee: {
        id: context.employee.id,
        name: context.employee.fullName,
        matricule: context.employee.localMatricule || context.employee.biotimeCode || context.employee.employeeCode,
        biotimeCode: context.employee.biotimeCode || context.employee.zktecoId,
        department: context.employee.department,
        hireDate: context.employee.hireDate
      },
      sap: sap ? {
        code: `${sap.sapCompany}-${sap.sapEmpId}`,
        company: sap.sapCompany,
        name: sap.fullName,
        arabicName: sapNameAr,
        poste: sap.poste,
        structure: sap.structure,
        phone: sap.mobile
      } : null,
      unit: { id: context.unit.id, name: context.unit.name, legalName: context.unit.fullLegalName, gerantName: context.unit.gerantName, gerantTitle: context.unit.gerantTitle },
      decision: {
        decisionType,
        employeeName: sapNameAr || sap?.fullName || context.employee.fullName || "",
        employeePosition: sap?.poste || biotimePosition || "",
        employeeNumber,
        hireDate: isoDate(hireDate),
        newPosition: "",
        grade: "",
        category: "",
        decisionDate: isoDate(decisionDate),
        contractDate: isoDate(contractDate),
        requestDate: isoDate(decisionDate),
        effectiveDate: isoDate(effectiveDate),
        gerantName: context.unit.gerantName || ""
      },
      sources: {
        employeeName: sapNameAr ? "SAP arabe" : sap?.fullName ? "SAP" : "RH Solution / BioTime",
        employeePosition: sap?.poste ? "SAP" : biotimePosition ? "BioTime" : "Manuel",
        employeeNumber: employeeNumber === `${sap?.sapEmpId}/${sap?.sapCompany}` ? "SAP" : "RH Solution / BioTime",
        hireDate: sap?.hireDate ? "SAP" : context.employee.hireDate ? "BioTime" : context.employee.contracts.length ? "Contrats RH" : "Manuel",
        newPosition: "Manuel",
        grade: "Manuel",
        category: "Manuel",
        contractDate: context.employee.contracts.length ? "Contrats RH" : sap?.hireDate ? "SAP" : context.employee.hireDate ? "BioTime" : "Manuel",
        effectiveDate: context.employee.resignedAt || context.employee.resignRecords[0]?.resignDate ? "BioTime démission" : "Manuel",
        gerantName: context.unit.gerantName ? "Paramétrage société" : "Manuel"
      },
      missingFields: this.missing(context, decisionType),
      history
    };
  }

  async generate(employeeId: string, body: DecisionGenerateBody, actor: RequestUser) {
    this.generatorOnly(actor);
    const decisionType = normalizeDecisionType(body.decisionType);
    const previous = await this.prisma.resignationDecision.findFirst({ where: { employeeId, decisionType }, orderBy: { generatedAt: "desc" }, select: decisionSelect });
    if (previous && !body.regenerate) return previous;
    const context = await this.context(employeeId, decisionType); const decisionDate = parseDate(body.decisionDate || isoDate(new Date()), "Date de décision invalide.");
    const effectiveDate = parseDate(body.overrides?.effectiveDate || body.effectiveDate || (context.employee.resignedAt ? isoDate(context.employee.resignedAt) : isoDate(new Date())), "Date d'effet invalide.");
    const requestDate = parseDate(body.overrides?.requestDate || body.requestDate || body.decisionDate || isoDate(new Date()), "Date de demande invalide.");
    const year = decisionDate.getUTCFullYear(); await mkdir(join(STORAGE, "pdf", String(year)), { recursive: true });

    const saved = await this.prisma.$transaction(async tx => {
      const sequence = await tx.$queryRaw<Array<{ last_number: number }>>`INSERT INTO "resignation_decision_sequences" ("id", "unit_id", "year", "last_number", "updated_at") VALUES (${randomUUID()}::uuid, ${context.unit.id}::uuid, ${year}, 1, NOW()) ON CONFLICT ("unit_id", "year") DO UPDATE SET "last_number" = "resignation_decision_sequences"."last_number" + 1, "updated_at" = NOW() RETURNING "last_number"`;
      const number = `${String(sequence[0].last_number).padStart(2, "0")}/DG/RH/${year}`;
      const snapshot = await this.snapshot(context, decisionType, number, sequence[0].last_number, decisionDate, effectiveDate, requestDate, body.overrides); const html = await this.html(snapshot); const buffer = await this.renderPdf(html);
      const id = randomUUID(); const path = join(STORAGE, "pdf", String(year), `${id}.pdf`); await writeFile(path, buffer);
      return tx.resignationDecision.create({ data: { id, employeeId, unitId: context.unit.id, sequenceYear: year, sequenceNumber: sequence[0].last_number, decisionType, decisionNumber: number, decisionDate, effectiveDate, generatedById: actor.id, pdfFilePath: path, documentSnapshot: snapshot as unknown as Prisma.InputJsonValue }, select: decisionSelect });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 45_000 });
    await this.audit.record({ userId: actor.id, action: "resignation_decision.generate", entityType: "resignation_decision", entityId: saved.id, metadata: { decisionNumber: saved.decisionNumber, decisionType, employeeId, regeneration: Boolean(body.regenerate) } });
    return saved;
  }

  async pdf(id: string, actor: RequestUser) { this.generatorOnly(actor); const row = await this.prisma.resignationDecision.findUnique({ where: { id } }); if (!row || !existsSync(row.pdfFilePath)) throw new NotFoundException("PDF historique introuvable."); return { buffer: await readFile(row.pdfFilePath), number: row.decisionNumber }; }

  private async context(employeeId: string, decisionType: DecisionType) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        contracts: { orderBy: { startDate: "desc" } },
        resignRecords: { orderBy: [{ resignDate: "desc" }, { updatedAt: "desc" }], take: 1 },
        sapDirectoryRecords: { orderBy: { lastSyncedAt: "desc" }, take: 1 },
        group: { include: { subUnit: { include: { unit: true } } } }
      }
    });
    if (!employee) throw new NotFoundException("Employé introuvable.");
    if (decisionType === "RESIGNATION" && employee.status !== "RESIGNED") throw new BadRequestException("L'employé doit être démissionné.");
    const unit = employee.group?.subUnit.unit || await this.fallbackUnit(employee);
    if (!unit) throw new BadRequestException("Société introuvable dans l'organigramme de l'employé et aucun lien SAP exploitable.");
    return { employee, unit };
  }
  private async fallbackUnit(employee: EmployeeCompanyFallback) {
    const company = employee.sapDirectoryRecords[0]?.sapCompany || companyFromEmployeeCodes(employee);
    if (!company) return null;
    return this.prisma.unit.findFirst({ where: { OR: [{ code: { equals: company, mode: "insensitive" } }, { name: { equals: company, mode: "insensitive" } }] } });
  }
  private missing(c: Awaited<ReturnType<ResignationDecisionsService["context"]>>, decisionType: DecisionType) {
    const used = templateVariables(decisionTemplate(c.unit, decisionType));
    const missing: string[] = [];
    const sap = c.employee.sapDirectoryRecords[0] || null;
    if (used.has("company_legal_name") && !c.unit.fullLegalName) missing.push("company_legal_name");
    if (used.has("gerant_name") && !c.unit.gerantName) missing.push("gerant_name");
    if (used.has("employee_position") && !sap?.poste && !position(c.employee.sourcePayload)) missing.push("employee_position");
    if (decisionType === "POSITION_CHANGE") for (const key of ["new_position", "grade", "category"]) if (used.has(key)) missing.push(key);
    return missing;
  }
  private async snapshot(c: Awaited<ReturnType<ResignationDecisionsService["context"]>>, decisionType: DecisionType, number: string, sequence: number, decisionDate: Date, effectiveDate: Date, requestDate: Date, overrides?: DecisionOverrides) {
    const contractDate = overrides?.contractDate ? parseDate(overrides.contractDate, "Date de contrat invalide.") : (contractStart(c.employee.contracts, effectiveDate) || c.employee.sapDirectoryRecords[0]?.hireDate || c.employee.hireDate || requestDate);
    const hireDate = overrides?.hireDate ? parseDate(overrides.hireDate, "Date de recrutement invalide.") : (c.employee.sapDirectoryRecords[0]?.hireDate || c.employee.hireDate || contractDate);
    const sap = c.employee.sapDirectoryRecords[0] || null;
    const employeePosition = cleanOverride(overrides?.employeePosition) || sap?.poste || position(c.employee.sourcePayload) || "___";
    const vars: Record<string,string> = {
      employee_name: cleanOverride(overrides?.employeeName) || sapArabicName(sap?.rawPayload) || sap?.fullName || c.employee.fullName || "___",
      employee_position: employeePosition,
      employee_number: cleanOverride(overrides?.employeeNumber) || displayEmployeeNumber(c.employee, sap),
      new_position: cleanOverride(overrides?.newPosition) || "___",
      grade: cleanOverride(overrides?.grade) || "___",
      category: cleanOverride(overrides?.category) || "___",
      decision_title: decisionType === "POSITION_CHANGE" ? "قرار تغيير المنصب" : "قرار الاستقالة",
      decision_number: number,
      decision_number_ar: `${String(sequence).padStart(2, "0")} / م ع/ م م ب/${decisionDate.getUTCFullYear()}`,
      decision_sequence: String(sequence).padStart(2, "0"),
      decision_year: String(decisionDate.getUTCFullYear()),
      decision_date: formatDate(decisionDate),
      hire_date: formatDate(hireDate),
      contract_date: formatDate(contractDate),
      request_date: formatDate(requestDate),
      effective_date: formatDate(effectiveDate),
      effective_date_ar: formatArabicDate(effectiveDate),
      company_legal_name: c.unit.fullLegalName || c.unit.name || "___",
      gerant_name: cleanOverride(overrides?.gerantName) || c.unit.gerantName || "___"
    };
    const template = normalizeTemplateText(decisionTemplate(c.unit, decisionType));
    return {
      decisionType,
      vars,
      content: substituteVariables(template, vars),
      unit: Object.fromEntries(["name", "fullLegalName", "legalForm", "legalAddress", "capitalSocial", "rcNumber", "nifNumber", "artNumber", "legalPhones", "legalEmail", "legalWebsite", "gerantName", "gerantTitle"].map(k => [k, (c.unit as any)[k] || "___"])),
      logo: c.unit.legalLogoPath && existsSync(c.unit.legalLogoPath) ? `data:${extname(c.unit.legalLogoPath) === ".png" ? "image/png" : "image/jpeg"};base64,${(await readFile(c.unit.legalLogoPath)).toString("base64")}` : null
    };
  }
  private async html(s: any) {
    const fontPath = "C:\\Windows\\Fonts\\arial.ttf";
    const font = existsSync(fontPath) ? (await readFile(fontPath)).toString("base64") : "";
    const lines = renderDecisionLines(String(s.content || ""));
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>@font-face{font-family:ArabicLocal;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}@page{size:A4;margin:0}html,body{margin:0;padding:0;background:white}.page{font-family:ArabicLocal,Arial,sans-serif;direction:rtl;width:210mm;min-height:297mm;padding:14mm 20mm 14mm;color:#111;font-size:14.2px;line-height:1.72}.letter-logo{display:block;max-width:170mm;max-height:30mm;margin:0 auto 8mm;object-fit:contain}.doc-head-line{text-align:center;font-weight:800;font-size:15.5px;line-height:1.7}.content{margin-top:14px}.decision-line{margin:4px 0;text-align:justify;page-break-inside:avoid}.decision-line.blank{height:8px;margin:0}.decision-line.recital{padding-right:16px;text-indent:-13px}.decision-line.center{text-align:center;font-weight:800;font-size:17px;margin:15px 0 12px}.align-center{text-align:center!important}.align-left{text-align:left!important}.align-right{text-align:right!important}.decision-line.article{font-size:15px;margin:7px 0}.decision-line.article strong{font-weight:800}.text-small{font-size:.88em}.text-large{font-size:1.18em}.text-ltr{direction:ltr;unicode-bidi:isolate;display:inline-block}.text-rtl{direction:rtl;unicode-bidi:isolate}.copies{margin-top:20px;line-height:1.85}.signature{margin-top:10mm;margin-right:auto;width:58mm;text-align:center;line-height:1.9;font-size:15px}.signature + .signature{margin-top:0}.signature strong{font-weight:800}</style></head><body><main class="page">${s.logo ? `<img class="letter-logo" src="${s.logo}">` : ""}${lines}</main></body></html>`;
  }
  private async renderPdf(html: string) { const executablePath = chromePath(); const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }); try { const page = await browser.newPage(); await page.setContent(html, { waitUntil: "load" }); return Buffer.from(await page.pdf({ format: "A4", printBackground: true })); } finally { await browser.close(); } }
  private adminOnly(actor: RequestUser) { if (!actor.roles.includes("ADMIN")) throw new ForbiddenException("Paramétrage réservé à Admin."); }
  private generatorOnly(actor: RequestUser) { if (!actor.roles.some(r => r === "ADMIN" || r === "DRH" || r === "GRH")) throw new ForbiddenException("Génération réservée à Admin, DRH et GRH."); }
}

const unitSelect = { id: true, name: true, code: true, legalLogoPath: true, fullLegalName: true, legalForm: true, legalAddress: true, capitalSocial: true, rcNumber: true, nifNumber: true, artNumber: true, legalPhones: true, legalEmail: true, legalWebsite: true, gerantName: true, gerantTitle: true, resignationDecisionTemplate: true, positionChangeDecisionTemplate: true } as const;
const decisionSelect = { id: true, decisionType: true, decisionNumber: true, decisionDate: true, effectiveDate: true, generatedAt: true, generatedBy: { select: { fullName: true, username: true } } } as const;
export function substituteVariables(template: string, vars: Record<string,string>) { return template.replace(/{{\s*([a-z_]+)\s*}}/gi, (_, key) => formatSubstitutedValue(vars[key] || "___")); }
export function normalizeResignationTemplateForPdf(value: string) { return normalizeTemplateText(value); }
export function selectResignationDecisionTemplate(value?: string | null) { return decisionTemplate({ resignationDecisionTemplate: value, positionChangeDecisionTemplate: null }, "RESIGNATION"); }
function templateVariables(template: string) { return new Set(Array.from(template.matchAll(/{{\s*([a-z_]+)\s*}}/gi), match => match[1])); }
function decisionTemplate(unit: { resignationDecisionTemplate?: string | null; positionChangeDecisionTemplate?: string | null }, decisionType: DecisionType) {
  const saved = decisionType === "POSITION_CHANGE" ? unit.positionChangeDecisionTemplate : unit.resignationDecisionTemplate;
  const fallback = decisionType === "POSITION_CHANGE" ? DEFAULT_POSITION_CHANGE_DECISION_TEMPLATE : DEFAULT_RESIGNATION_DECISION_TEMPLATE;
  const normalized = normalizeTemplateText(saved || "");
  const variables = templateVariables(normalized);
  const hasWorkerVariables = variables.has("employee_name") && variables.has("employee_position");
  const hasDateVariables = decisionType === "POSITION_CHANGE"
    ? variables.has("hire_date") && (variables.has("effective_date") || variables.has("effective_date_ar"))
    : variables.has("contract_date") && variables.has("request_date") && (variables.has("effective_date") || variables.has("effective_date_ar"));
  const hasPositionChangeVariables = decisionType !== "POSITION_CHANGE" || variables.has("new_position");
  return hasWorkerVariables && hasDateVariables && hasPositionChangeVariables ? normalized : fallback;
}
function cleanOverride(value?: string) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function normalizeDecisionType(value?: string): DecisionType {
  return DECISION_TYPES.includes(value as DecisionType) ? value as DecisionType : "RESIGNATION";
}
function displayEmployeeNumber(employee: { localMatricule: string | null; employeeCode: string; biotimeCode: string | null }, sap?: { sapCompany: string; sapEmpId: string } | null) {
  if (sap?.sapCompany && sap.sapEmpId) return `${sap.sapEmpId}/${sap.sapCompany}`;
  return employee.localMatricule || employee.biotimeCode || employee.employeeCode || "___";
}
function sapArabicName(payload: unknown) {
  const row = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const direct = rawArabicString(row, ["arabicName", "arabic_name", "fullNameArabic", "full_name_ar", "nameArabic", "name_ar", "NomAr", "PrenomAr", "U_CMC_NOMAR", "U_CMC_PRENOMAR", "U_CMC_NomAr", "U_CMC_PrenomAr"]);
  if (direct) return direct;
  const parts = [rawArabicString(row, ["lastNameArabic", "last_name_ar", "Nom_Ar", "nom_ar"]), rawArabicString(row, ["firstNameArabic", "first_name_ar", "Prenom_Ar", "prenom_ar"])].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return Object.values(row).find(value => typeof value === "string" && /[\u0600-\u06FF]/.test(value) && value.trim().split(/\s+/).length >= 2)?.toString().trim() || null;
}
function rawArabicString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && /[\u0600-\u06FF]/.test(value) && value.trim()) return value.trim();
  }
  return null;
}
function companyFromEmployeeCodes(employee: EmployeeCompanyFallback) {
  for (const value of [employee.localMatricule, employee.employeeCode, employee.biotimeCode]) {
    const match = String(value || "").match(/^(FABCOM|RECYCLAGE|NEWTECH)(?:_DEV)?-/i);
    if (match) return match[1].toUpperCase();
  }
  return null;
}
function position(payload: unknown) { const p = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}; for (const key of ["position_name", "position", "job_title", "title", "designation"]) if (typeof p[key] === "string" && p[key]) return String(p[key]); return null; }
function parseDate(value: string, message: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(message); const d = new Date(`${value}T00:00:00.000Z`); if (Number.isNaN(d.getTime())) throw new BadRequestException(message); return d; }
function isoDate(d: Date) { return d.toISOString().slice(0,10); } function formatDate(d: Date) { return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC" }).format(d); }
function formatArabicDate(d: Date) { const months = ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]; return `${String(d.getUTCDate()).padStart(2, "0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function contractStart(contracts: Array<{ startDate: Date }>, effectiveDate: Date) { return contracts.find(contract => contract.startDate <= effectiveDate)?.startDate || contracts[0]?.startDate || null; }
function normalizeTemplateText(value: string) {
  return value
    .replace(/&#x20;|&nbsp;/gi, " ")
    .replace(/&#xA0;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\*{3,}/g, "")
    .replace(/^\s*\*\s*/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
function renderDecisionLines(content: string) {
  return content.split(/\r?\n/).map(raw => {
    let line = raw.trim();
    if (!line) return `<div class="decision-line blank"></div>`;
    const align = line.match(/^::(center|left|right)::\s*(.*)$/);
    const alignClass = align ? ` align-${align[1]}` : "";
    if (align) line = align[2];
    const semantic = stripInlineMarkers(line);
    if (/^(المديري|مديري|رقم|قـ|قــــ|قرار الاستقالة)/.test(semantic)) return `<div class="doc-head-line${alignClass}">${rich(line)}</div>`;
    if (/^يق/.test(semantic)) return `<div class="decision-line center${alignClass}">${rich(line)}</div>`;
    if (/^نسخة/.test(semantic)) return `<div class="copies${alignClass}">${rich(line)}</div>`;
    if (/^(المعن|ملف المعني)$/.test(semantic)) return `<div class="decision-line${alignClass}">${rich(line)}</div>`;
    if (/^(مسير الشركة|{{gerant_name}}|ع\.|أ\.)/.test(semantic)) return `<div class="signature${alignClass}">${rich(line)}</div>`;
    if (/^-/.test(semantic)) return `<div class="decision-line recital${alignClass}">${rich(line)}</div>`;
    const article = line.match(/^(المادة\s+\d+\s*:)(.*)$/);
    if (article) return `<div class="decision-line article${alignClass}"><strong>${esc(article[1])}</strong>${rich(article[2])}</div>`;
    if (/^المادة\s+\d+\s*:/.test(semantic)) return `<div class="decision-line article${alignClass}">${rich(line)}</div>`;
    return `<div class="decision-line${alignClass}">${rich(line)}</div>`;
  }).join("");
}
function formatSubstitutedValue(value: string) {
  const text = String(value || "___");
  if (text === "___" || text.includes("[[")) return text;
  return /[A-Za-zÀ-ÿ]/.test(text) ? `[[ltr]]${text}[[/ltr]]` : text;
}
function stripInlineMarkers(value: string) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[\[(?:small|large|ltr|rtl)\]\](.+?)\[\[\/(?:small|large|ltr|rtl)\]\]/g, "$1")
    .replace(/\[\[size:\d{1,2}\]\](.+?)\[\[\/size\]\]/g, "$1")
    .trim();
}
function rich(v: unknown) {
  return esc(v)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*\*/g, "")
    .replace(/\[\[small\]\](.+?)\[\[\/small\]\]/g, '<span class="text-small">$1</span>')
    .replace(/\[\[large\]\](.+?)\[\[\/large\]\]/g, '<span class="text-large">$1</span>')
    .replace(/\[\[size:(\d{1,2})\]\](.+?)\[\[\/size\]\]/g, (_, size, text) => `<span style="font-size:${Math.min(28, Math.max(8, Number(size)))}px">${text}</span>`)
    .replace(/\[\[ltr\]\](.+?)\[\[\/ltr\]\]/g, '<span class="text-ltr" dir="ltr">$1</span>')
    .replace(/\[\[rtl\]\](.+?)\[\[\/rtl\]\]/g, '<span class="text-rtl" dir="rtl">$1</span>');
}
function esc(v: unknown) { return String(v ?? "___").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!)); }
function chromePath() { const candidates = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"]; const found = candidates.find(existsSync); if (!found) throw new BadRequestException("Chrome ou Edge est requis sur le serveur pour générer le PDF."); return found; }
