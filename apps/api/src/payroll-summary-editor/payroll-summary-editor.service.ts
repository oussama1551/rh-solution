import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AttendanceSummaryStatus } from "@prisma/client";
import { employeeScopeWhere } from "../common/employee-scope";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { RoleCode } from "../roles/role-codes";

const MOTIFS = [
  { code: "P", label: "Présence", source: "RH" }, { code: "I", label: "Pointage incomplet", source: "RH" },
  { code: "A", label: "Absence", source: "RH" }, { code: "R", label: "Repos", source: "RH" },
  { code: "M", label: "Maladie", source: "RH" }, { code: "C", label: "Congé", source: "RH" },
  { code: "RC", label: "Récupération", source: "RH" },
  { code: "DC", label: "Début contrat", source: "RH" }, { code: "FC", label: "Fin contrat", source: "RH" },
  { code: "AA", label: "Absence autorisée", source: "SAP" }, { code: "AI", label: "Absence injustifiée", source: "SAP" },
  { code: "AM", label: "Absence maladie", source: "SAP" }, { code: "ADC", label: "Absence début contrat", source: "SAP" },
  { code: "DCS", label: "Décès", source: "RH" },
  { code: "SAN", label: "Sanction", source: "SAP" }, { code: "AT", label: "Accident travail", source: "SAP" },
  { code: "AMA", label: "Absence maternité", source: "SAP" }, { code: "AD", label: "Absence diverse", source: "SAP" }
] as const;

@Injectable()
export class PayrollSummaryEditorService {
  constructor(private readonly prisma: PrismaService) {}

  motifs() { return MOTIFS; }

  async list(startDate: string, endDate: string, actor: RequestUser) {
    const period = this.period(startDate, endDate);
    return this.prisma.payrollSummaryOverride.findMany({
      where: { periodStart: period.start, periodEnd: period.end, employee: employeeScopeWhere(actor) },
      include: { editedBy: { select: { id: true, fullName: true, username: true } } },
      orderBy: [{ workDate: "asc" }, { employee: { fullName: "asc" } }]
    });
  }

  async save(employeeId: string, workDate: string, startDate: string, endDate: string, body: { code?: string; note?: string }, actor: RequestUser) {
    this.assertEditor(actor);
    const period = this.period(startDate, endDate);
    const day = this.date(workDate, "jour");
    if (day < period.start || day > period.end) throw new BadRequestException("Le jour doit appartenir à la période sélectionnée.");
    const code = String(body.code || "").trim().toUpperCase();
    if (!MOTIFS.some(item => item.code === code)) throw new BadRequestException("Motif de paie inconnu.");
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, ...employeeScopeWhere(actor) }, select: { id: true } });
    if (!employee) throw new NotFoundException("Employé introuvable.");
    const source = await this.prisma.attendanceSummaryRecord.findUnique({
      where: { employeeId_workDate_periodStart_periodEnd: { employeeId, workDate: day, periodStart: period.start, periodEnd: period.end } },
      select: { status: true }
    });
    const originalCode = statusCode(source?.status);
    const existing = await this.prisma.payrollSummaryOverride.findUnique({
      where: { employeeId_workDate_periodStart_periodEnd: { employeeId, workDate: day, periodStart: period.start, periodEnd: period.end } }
    });
    if (code === originalCode && !existing) return null;
    const note = body.note?.trim() || null;
    return this.prisma.$transaction(async tx => {
      const saved = await tx.payrollSummaryOverride.upsert({
        where: { employeeId_workDate_periodStart_periodEnd: { employeeId, workDate: day, periodStart: period.start, periodEnd: period.end } },
        create: { employeeId, workDate: day, periodStart: period.start, periodEnd: period.end, originalCode, overrideCode: code, note, editedById: actor.id },
        update: { overrideCode: code, note, editedById: actor.id }
      });
      await tx.payrollSummaryOverrideHistory.create({ data: { employeeId, workDate: day, periodStart: period.start, periodEnd: period.end, previousCode: existing?.overrideCode || originalCode || null, newCode: code, note, action: existing ? "UPDATE" : "CREATE", changedById: actor.id } });
      return saved;
    });
  }

  async restore(employeeId: string, workDate: string, startDate: string, endDate: string, actor: RequestUser) {
    this.assertEditor(actor);
    const period = this.period(startDate, endDate), day = this.date(workDate, "jour");
    const existing = await this.prisma.payrollSummaryOverride.findUnique({ where: { employeeId_workDate_periodStart_periodEnd: { employeeId, workDate: day, periodStart: period.start, periodEnd: period.end } } });
    if (!existing) throw new NotFoundException("Aucune correction à restaurer.");
    await this.prisma.$transaction([
      this.prisma.payrollSummaryOverrideHistory.create({ data: { employeeId, workDate: day, periodStart: period.start, periodEnd: period.end, previousCode: existing.overrideCode, newCode: existing.originalCode || null, note: existing.note, action: "RESTORE", changedById: actor.id } }),
      this.prisma.payrollSummaryOverride.delete({ where: { id: existing.id } })
    ]);
    return { restored: true, code: existing.originalCode };
  }

  async confirmations(startDate: string, endDate: string, actor: RequestUser) {
    const period = this.period(startDate, endDate);
    return this.prisma.payrollSummaryConfirmation.findMany({ where: { periodStart: period.start, periodEnd: period.end, employee: employeeScopeWhere(actor) }, include: { confirmedBy: { select: { id: true, fullName: true, username: true } } } });
  }

  async confirm(employeeId: string, startDate: string, endDate: string, actor: RequestUser) {
    this.assertEditor(actor);
    if (new Date().getDate() <= 20) throw new BadRequestException("La confirmation des pointages est disponible après le 20 du mois.");
    const period = this.period(startDate, endDate);
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, ...employeeScopeWhere(actor) }, select: { id: true } });
    if (!employee) throw new NotFoundException("Employé introuvable.");
    return this.prisma.payrollSummaryConfirmation.upsert({ where: { employeeId_periodStart_periodEnd: { employeeId, periodStart: period.start, periodEnd: period.end } }, create: { employeeId, periodStart: period.start, periodEnd: period.end, confirmedById: actor.id }, update: { confirmedById: actor.id, confirmedAt: new Date() }, include: { confirmedBy: { select: { id: true, fullName: true, username: true } } } });
  }

  async unconfirm(employeeId: string, startDate: string, endDate: string, actor: RequestUser) {
    this.assertEditor(actor);
    const period = this.period(startDate, endDate);
    await this.prisma.payrollSummaryConfirmation.deleteMany({ where: { employeeId, periodStart: period.start, periodEnd: period.end } });
    return { restored: true };
  }

  private assertEditor(actor: RequestUser) {
    const roles = new Set(actor.roles);
    if (!roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH) && !roles.has(RoleCode.GRH)) throw new ForbiddenException("Modification réservée à Admin, DRH et GRH.");
  }
  private period(startDate: string, endDate: string) { const start = this.date(startDate, "début"), end = this.date(endDate, "fin"); if (start > end) throw new BadRequestException("Période invalide."); return { start, end }; }
  private date(value: string, label: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw new BadRequestException(`Date de ${label} invalide.`); const date = new Date(`${value}T00:00:00.000Z`); if (Number.isNaN(date.getTime())) throw new BadRequestException(`Date de ${label} invalide.`); return date; }
}

export function statusCode(status?: AttendanceSummaryStatus) {
  return status === "PRESENT" ? "P" : status === "ABSENT" ? "A" : status === "SICK" || status === "ACCIDENT" ? "M" : status === "LEAVE" ? "C" : status === "COMPENSATED" ? "CP" : status === "REST" ? "R" : status === "INCOMPLETE" ? "I" : status === "ABSENCE_REVERSED" ? "SP" : status === "CONTRACT_NOT_STARTED" ? "DC" : status === "CONTRACT_ENDED" ? "FC" : "";
}
