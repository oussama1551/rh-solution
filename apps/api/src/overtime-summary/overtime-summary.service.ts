import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalStatus } from "@prisma/client";
import { employeeScopeWhere } from "../common/employee-scope";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { RoleCode } from "../roles/role-codes";

@Injectable()
export class OvertimeSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async rows(startDate: string, endDate: string, search: string | undefined, actor: RequestUser) {
    const { start, end } = this.period(startDate, endDate), needle = search?.trim();
    const employees = await this.prisma.employee.findMany({
      where: { ...employeeScopeWhere(actor), status: "ACTIVE", ...(needle ? { OR: [{ fullName: { contains: needle, mode: "insensitive" } }, { employeeCode: { contains: needle, mode: "insensitive" } }, { localMatricule: { contains: needle, mode: "insensitive" } }] } : {}) },
      orderBy: { fullName: "asc" },
      select: {
        id: true, fullName: true, employeeCode: true, localMatricule: true, biotimeCode: true, department: true,
        group: { select: { name: true, subUnit: { select: { name: true, unit: { select: { name: true } } } } } },
        overtimeDeclarations: { where: { date: { gte: start, lte: end }, status: { in: [ApprovalStatus.APPROVED, ApprovalStatus.PENDING_APPROVAL] } }, orderBy: { date: "asc" }, select: { id: true, date: true, hours: true, rateType: true, ratePercent: true, status: true, reason: true } },
        overtimeSummaryConfirmations: { where: { periodStart: start, periodEnd: end }, include: { confirmedBy: { select: { id: true, fullName: true, username: true } } }, take: 1 }
      }
    });
    return employees.map(employee => {
      const days = new Map<string, { date: string; rate50: number; rate75: number; rate100: number; pendingHours: number; declarations: number }>();
      for (const declaration of employee.overtimeDeclarations) {
        const date = declaration.date.toISOString().slice(0, 10), hours = Number(declaration.hours);
        const day = days.get(date) || { date, rate50: 0, rate75: 0, rate100: 0, pendingHours: 0, declarations: 0 };
        day.declarations += 1;
        if (declaration.status === ApprovalStatus.PENDING_APPROVAL) day.pendingHours += hours;
        else if (declaration.rateType === "RATE_75") day.rate75 += hours;
        else if (declaration.rateType === "RATE_100") day.rate100 += hours;
        else day.rate50 += hours;
        days.set(date, day);
      }
      const daily = [...days.values()].map(day => ({ ...day, rate50: round(day.rate50), rate75: round(day.rate75), rate100: round(day.rate100), pendingHours: round(day.pendingHours) }));
      const totals = daily.reduce((sum, day) => ({ rate50: sum.rate50 + day.rate50, rate75: sum.rate75 + day.rate75, rate100: sum.rate100 + day.rate100, pending: sum.pending + day.pendingHours }), { rate50: 0, rate75: 0, rate100: 0, pending: 0 });
      const confirmation = employee.overtimeSummaryConfirmations[0] || null;
      return { employee: { id: employee.id, fullName: employee.fullName, code: employee.localMatricule || employee.biotimeCode || employee.employeeCode, department: employee.department, organigram: [employee.group?.subUnit.unit.name, employee.group?.subUnit.name, employee.group?.name].filter(Boolean).join(" > ") || employee.department || "-" }, days: daily, totals: { rate50: round(totals.rate50), rate75: round(totals.rate75), rate100: round(totals.rate100), total: round(totals.rate50 + totals.rate75 + totals.rate100), pending: round(totals.pending) }, confirmedAt: confirmation?.confirmedAt || null, confirmedBy: confirmation?.confirmedBy || null };
    });
  }

  async confirm(employeeId: string, startDate: string, endDate: string, actor: RequestUser) {
    this.assertConfirmer(actor);
    if (new Date().getDate() <= 20) throw new BadRequestException("La confirmation des heures supplémentaires est disponible après le 20 du mois.");
    const { start, end } = this.period(startDate, endDate);
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, ...employeeScopeWhere(actor) }, select: { id: true } });
    if (!employee) throw new NotFoundException("Employé introuvable.");
    return this.prisma.overtimeSummaryConfirmation.upsert({ where: { employeeId_periodStart_periodEnd: { employeeId, periodStart: start, periodEnd: end } }, create: { employeeId, periodStart: start, periodEnd: end, confirmedById: actor.id }, update: { confirmedById: actor.id, confirmedAt: new Date() } });
  }

  async restore(employeeId: string, startDate: string, endDate: string, actor: RequestUser) {
    this.assertConfirmer(actor); const { start, end } = this.period(startDate, endDate);
    await this.prisma.overtimeSummaryConfirmation.deleteMany({ where: { employeeId, periodStart: start, periodEnd: end } }); return { restored: true };
  }

  private assertConfirmer(actor: RequestUser) { const roles = new Set(actor.roles); if (![RoleCode.Admin, RoleCode.DRH, RoleCode.GRH].some(role => roles.has(role))) throw new ForbiddenException("Action réservée à Admin, DRH et GRH."); }
  private period(startDate: string, endDate: string) { const start = parseDate(startDate), end = parseDate(endDate); if (start > end) throw new BadRequestException("Période invalide."); return { start, end }; }
}
function parseDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw new BadRequestException("Date invalide."); return new Date(`${value}T00:00:00.000Z`); }
function round(value: number) { return Math.round(value * 100) / 100; }
