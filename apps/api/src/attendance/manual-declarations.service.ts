import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalStatus, ExceptionalLeaveReason, LeaveType, NotificationType, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { employeeScopeWhere } from "../common/employee-scope";
import { RequestUser } from "../common/request-user.type";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "../reports/reports.service";
import { RoleCode } from "../roles/role-codes";
import { CreateAbsenceCompensationDto, CreateAbsenceReversalRequestDto, CreateLeaveDeclarationDto, CreateManualAbsenceDeclarationDto, CreateOvertimeDeclarationDto, CreateSickLeaveDeclarationDto, UpdateLeaveDeclarationDto, UpdateSickLeaveDeclarationDto } from "./dto/manual-declarations.dto";

@Injectable()
export class ManualDeclarationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly reports: ReportsService
  ) {}

  async createOvertime(dto: CreateOvertimeDeclarationDto, actor: RequestUser) {
    this.ensureOvertimeOrCompensationDeclarer(actor);
    await this.ensureEmployeeVisible(dto.employeeId, actor);
    const punchCount = await this.countPresencePunches(dto.employeeId, dto.date);
    if (!punchCount) {
      throw new BadRequestException("Aucun pointage réel trouvé sur ce jour. Les heures supplémentaires ne peuvent pas être déclarées.");
    }
    const approval = this.approvalFor(actor);
    const row = await this.prisma.overtimeDeclaration.create({
      data: {
        employeeId: dto.employeeId,
        date: parseDate(dto.date),
        hours: new Prisma.Decimal(dto.hours),
        rateType: dto.rateType,
        ratePercent: new Prisma.Decimal(ratePercent(dto.rateType)),
        reason: dto.reason?.trim() || null,
        declaredById: actor.id,
        status: approval.status,
        approvedById: approval.status === ApprovalStatus.APPROVED ? actor.id : null,
        approvedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null
      },
      include: this.declarationInclude()
    });
    await this.audit.record({ userId: actor.id, action: "overtime.create", entityType: "overtime_declaration", entityId: row.id, after: row as Prisma.InputJsonValue });
    if (row.status === ApprovalStatus.PENDING_APPROVAL) {
      await this.notifications.notify(await this.notifications.adminDrhUserIds(), NotificationType.PENDING_APPROVAL, {
        title: "Heures supplémentaires à valider",
        message: `${row.employee?.fullName || "Employé"} - ${Number(row.hours)} h`,
        entityType: "overtime_declaration",
        entityId: row.id
      });
    }
    return row;
  }

  async createCompensation(dto: CreateAbsenceCompensationDto, actor: RequestUser) {
    this.ensureOvertimeOrCompensationDeclarer(actor);
    await this.ensureEmployeeVisible(dto.employeeId, actor);
    const punchCount = await this.countPresencePunches(dto.employeeId, dto.compensationDate);
    if (!punchCount) {
      throw new BadRequestException("Aucun pointage réel trouvé sur le jour de compensation.");
    }

    const approval = this.approvalFor(actor);
    const row = await this.prisma.absenceCompensation.create({
      data: {
        employeeId: dto.employeeId,
        absenceDate: parseDate(dto.absenceDate),
        compensationDate: parseDate(dto.compensationDate),
        note: dto.note?.trim() || null,
        declaredById: actor.id,
        status: approval.status,
        approvedById: approval.status === ApprovalStatus.APPROVED ? actor.id : null,
        approvedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null
      },
      include: this.declarationInclude()
    });
    await this.audit.record({ userId: actor.id, action: "compensation.create", entityType: "absence_compensation", entityId: row.id, after: row as Prisma.InputJsonValue });
    if (row.status === ApprovalStatus.PENDING_APPROVAL) {
      await this.notifications.notify(await this.notifications.adminDrhUserIds(), NotificationType.PENDING_APPROVAL, {
        title: "Compensation à valider",
        message: `${row.employee.fullName}`,
        entityType: "absence_compensation",
        entityId: row.id
      });
    }
    return row;
  }

  async createAbsenceReversal(dto: CreateAbsenceReversalRequestDto, actor: RequestUser) {
    this.ensureAbsenceReversalDeclarer(actor);
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException("Le motif est obligatoire pour annuler une absence sans preuve de pointage.");
    await this.ensureEmployeeVisible(dto.employeeId, actor);
    const approval = this.approvalFor(actor);
    const row = await this.prisma.absenceReversalRequest.create({
      data: {
        employeeId: dto.employeeId,
        absenceDate: parseDate(dto.absenceDate),
        reason,
        declaredById: actor.id,
        status: approval.status,
        approvedById: approval.status === ApprovalStatus.APPROVED ? actor.id : null,
        approvedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null
      },
      include: this.absenceReversalInclude()
    });
    await this.audit.record({ userId: actor.id, action: "absence_reversal.create", entityType: "absence_reversal_request", entityId: row.id, after: row as Prisma.InputJsonValue });
    if (row.status === ApprovalStatus.PENDING_APPROVAL) {
      await this.notifications.notify(await this.notifications.adminDrhUserIds(), NotificationType.PENDING_APPROVAL, {
        title: "Annulation absence à valider",
        message: `${row.employee?.fullName || "Employé"} - sans preuve de pointage`,
        entityType: "absence_reversal_request",
        entityId: row.id
      });
    }
    return row;
  }

  async createManualAbsence(dto: CreateManualAbsenceDeclarationDto, actor: RequestUser) {
    this.ensureAbsenceReversalDeclarer(actor);
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException("Le motif de l'absence est obligatoire.");
    await this.ensureEmployeeVisible(dto.employeeId, actor);
    const date = parseDate(dto.absenceDate), next = parseDate(addDays(dto.absenceDate, 1));
    const [mainAbsences, punchCount, sickCount, leaveCount, existing] = await Promise.all([
      this.reports.dailyAbsences({ date: dto.absenceDate }, actor),
      this.prisma.attendancePunch.count({ where: { employeeId: dto.employeeId, countsAsPresence: true, punchTime: { gte: date, lt: next } } }),
      this.prisma.sickLeaveDeclaration.count({ where: { employeeId: dto.employeeId, status: ApprovalStatus.APPROVED, dateStart: { lte: date }, dateEnd: { gte: date } } }),
      this.prisma.leaveDeclaration.count({ where: { employeeId: dto.employeeId, status: ApprovalStatus.APPROVED, dateStart: { lte: date }, dateEnd: { gte: date } } }),
      this.prisma.manualAbsenceDeclaration.findUnique({ where: { employeeId_absenceDate: { employeeId: dto.employeeId, absenceDate: date } } })
    ]);
    if (mainAbsences.rows.some(row => row.employee.id === dto.employeeId && row.status === "ABSENT")) throw new BadRequestException("Cette absence existe déjà dans le module Absences principal.");
    if (punchCount) throw new BadRequestException("Déclaration impossible : un pointage réel existe pour cet employé ce jour-là.");
    if (sickCount || leaveCount) throw new BadRequestException("Déclaration impossible : ce jour est déjà couvert par une maladie ou un congé approuvé.");
    if (existing && existing.status !== ApprovalStatus.REJECTED) throw new BadRequestException("Une déclaration d'absence existe déjà pour cet employé et ce jour.");
    const approval = this.approvalFor(actor);
    const decision = { reason, declaredById: actor.id, status: approval.status, approvedById: approval.status === ApprovalStatus.APPROVED ? actor.id : null, approvedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null };
    const row = existing
      ? await this.prisma.manualAbsenceDeclaration.update({ where: { id: existing.id }, data: decision, include: this.manualAbsenceInclude() })
      : await this.prisma.manualAbsenceDeclaration.create({ data: { employeeId: dto.employeeId, absenceDate: date, ...decision }, include: this.manualAbsenceInclude() });
    await this.audit.record({ userId: actor.id, action: "manual_absence.create", entityType: "manual_absence_declaration", entityId: row.id, after: row as Prisma.InputJsonValue });
    if (row.status === ApprovalStatus.PENDING_APPROVAL) await this.notifyPending(row, "Absence manuelle à valider", "manual_absence_declaration");
    return row;
  }

  async listManualAbsences(actor: RequestUser) {
    return this.prisma.manualAbsenceDeclaration.findMany({ where: { employee: employeeScopeWhere(actor) }, orderBy: [{ absenceDate: "desc" }, { createdAt: "desc" }], take: 1000, include: this.manualAbsenceInclude() });
  }

  async approveManualAbsence(id: string, actor: RequestUser) {
    this.ensureApprover(actor);
    const row = await this.prisma.manualAbsenceDeclaration.update({ where: { id }, data: { status: ApprovalStatus.APPROVED, approvedById: actor.id, approvedAt: new Date() }, include: this.manualAbsenceInclude() }).catch(() => null);
    if (!row) throw new NotFoundException("Déclaration d'absence introuvable.");
    await this.audit.record({ userId: actor.id, action: "manual_absence.approve", entityType: "manual_absence_declaration", entityId: id });
    return row;
  }

  async rejectManualAbsence(id: string, reason: string | undefined, actor: RequestUser) {
    this.ensureApprover(actor);
    const row = await this.prisma.manualAbsenceDeclaration.update({ where: { id }, data: { status: ApprovalStatus.REJECTED, approvedById: actor.id, approvedAt: new Date(), ...(reason?.trim() ? { reason: reason.trim() } : {}) }, include: this.manualAbsenceInclude() }).catch(() => null);
    if (!row) throw new NotFoundException("Déclaration d'absence introuvable.");
    await this.audit.record({ userId: actor.id, action: "manual_absence.reject", entityType: "manual_absence_declaration", entityId: id, metadata: { reason: reason || null } });
    return row;
  }

  async createSickLeave(dto: CreateSickLeaveDeclarationDto, actor: RequestUser) {
    this.ensureSickLeaveDeclarer(actor);
    if (dto.dateEnd < dto.dateStart) throw new BadRequestException("La date de fin doit être après la date de début.");
    await this.ensureEmployeeVisible(dto.employeeId, actor);
    const approval = this.approvalFor(actor);
    const row = await this.prisma.sickLeaveDeclaration.create({
      data: {
        employeeId: dto.employeeId,
        dateStart: parseDate(dto.dateStart),
        dateEnd: parseDate(dto.dateEnd),
        note: dto.note?.trim() || null,
        declaredById: actor.id,
        status: approval.status,
        approvedById: approval.status === ApprovalStatus.APPROVED ? actor.id : null,
        approvedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null
      },
      include: this.sickLeaveDeclarationInclude()
    });
    await this.audit.record({ userId: actor.id, action: "sick_leave.create", entityType: "sick_leave_declaration", entityId: row.id, after: row as Prisma.InputJsonValue });
    await this.notifications.notify(await this.notifications.adminDrhUserIds(), NotificationType.SICK_LEAVE_DECLARED, {
      title: "Maladie déclarée",
      message: `${row.employee?.fullName || "Employé"}`,
      entityType: "sick_leave_declaration",
      entityId: row.id
    });
    return row;
  }

  async createLeave(dto: CreateLeaveDeclarationDto, actor: RequestUser) {
    this.ensureLeaveDeclarer(actor);
    if (dto.dateEnd < dto.dateStart) throw new BadRequestException("La date de fin doit être après la date de début.");
    await this.ensureEmployeeVisible(dto.employeeId, actor);
    const leaveType = dto.leaveType || LeaveType.ANNUEL;
    const exceptionalReason = leaveType === LeaveType.EXCEPTIONNEL ? dto.exceptionalReason || null : null;
    await this.validateLeaveRules(dto.employeeId, parseDate(dto.dateStart), parseDate(dto.dateEnd), leaveType, exceptionalReason, dto.note, actor);
    const approval = this.approvalFor(actor);
    const row = await this.prisma.leaveDeclaration.create({
      data: {
        employeeId: dto.employeeId,
        dateStart: parseDate(dto.dateStart),
        dateEnd: parseDate(dto.dateEnd),
        leaveType,
        exceptionalReason,
        note: dto.note?.trim() || null,
        declaredById: actor.id,
        status: approval.status,
        approvedById: approval.status === ApprovalStatus.APPROVED ? actor.id : null,
        approvedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null
      },
      include: this.leaveDeclarationInclude()
    });
    await this.audit.record({ userId: actor.id, action: "leave.create", entityType: "leave_declaration", entityId: row.id, after: row as Prisma.InputJsonValue });
    if (row.status === ApprovalStatus.APPROVED && row.leaveType === LeaveType.ANNUEL) {
      await this.recalculateAnnualLeaveBalances(row.employeeId, row.dateStart, row.dateEnd);
    }
    if (row.status === ApprovalStatus.PENDING_APPROVAL) {
      await this.notifications.notify(await this.notifications.adminDrhUserIds(), NotificationType.PENDING_APPROVAL, {
        title: "Congé à valider",
        message: `${row.employee?.fullName || "Employé"}`,
        entityType: "leave_declaration",
        entityId: row.id
      });
    } else {
      await this.notifications.notify(await this.notifications.adminDrhUserIds(), NotificationType.LEAVE_DECLARED, {
        title: "Congé déclaré",
        message: `${row.employee?.fullName || "Employé"}`,
        entityType: "leave_declaration",
        entityId: row.id
      });
    }
    return row;
  }

  async annualLeaveBalance(employeeId: string, year: number | undefined, actor: RequestUser) {
    await this.ensureEmployeeVisible(employeeId, actor);
    return this.recalculateAnnualLeaveBalance(employeeId, year || new Date().getFullYear());
  }

  async pendingApprovals() {
    const [overtime, compensations, sickLeaves, leaves, absenceReversals, manualAbsences] = await Promise.all([
      this.prisma.overtimeDeclaration.findMany({ where: { status: ApprovalStatus.PENDING_APPROVAL }, orderBy: { createdAt: "asc" }, include: this.declarationInclude() }),
      this.prisma.absenceCompensation.findMany({ where: { status: ApprovalStatus.PENDING_APPROVAL }, orderBy: { createdAt: "asc" }, include: this.declarationInclude() }),
      this.prisma.sickLeaveDeclaration.findMany({ where: { status: ApprovalStatus.PENDING_APPROVAL }, orderBy: { createdAt: "asc" }, include: this.sickLeaveDeclarationInclude() }),
      this.prisma.leaveDeclaration.findMany({ where: { status: ApprovalStatus.PENDING_APPROVAL }, orderBy: { createdAt: "asc" }, include: this.leaveDeclarationInclude() }),
      this.prisma.absenceReversalRequest.findMany({ where: { status: ApprovalStatus.PENDING_APPROVAL }, orderBy: { createdAt: "asc" }, include: this.absenceReversalInclude() }),
      this.prisma.manualAbsenceDeclaration.findMany({ where: { status: ApprovalStatus.PENDING_APPROVAL }, orderBy: { createdAt: "asc" }, include: this.manualAbsenceInclude() })
    ]);
    return { overtime, compensations, sickLeaves, leaves, absenceReversals, manualAbsences };
  }

  async listOvertime(actor: RequestUser, employeeId?: string) {
    const where: Prisma.OvertimeDeclarationWhereInput = {
      employee: employeeScopeWhere(actor)
    };
    if (employeeId) {
      await this.ensureEmployeeVisible(employeeId, actor);
      where.employeeId = employeeId;
    }
    return this.prisma.overtimeDeclaration.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 300,
      include: this.declarationInclude()
    });
  }

  async deleteOvertime(id: string, actor: RequestUser) {
    this.ensureAdmin(actor);
    const row = await this.prisma.overtimeDeclaration.findUnique({ where: { id }, include: this.declarationInclude() });
    if (!row) throw new NotFoundException("Déclaration heures supplémentaires introuvable.");
    await this.prisma.overtimeDeclaration.delete({ where: { id } });
    await this.audit.record({ userId: actor.id, action: "overtime.delete", entityType: "overtime_declaration", entityId: id, before: row as Prisma.InputJsonValue });
    return { ok: true };
  }

  async listSickLeaves(actor: RequestUser, employeeId?: string) {
    const where: Prisma.SickLeaveDeclarationWhereInput = {
      employee: employeeScopeWhere(actor)
    };
    if (employeeId) {
      await this.ensureEmployeeVisible(employeeId, actor);
      where.employeeId = employeeId;
    }
    return this.prisma.sickLeaveDeclaration.findMany({
      where,
      orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
      take: 300,
      include: this.sickLeaveDeclarationInclude()
    });
  }

  async overtimeByEmployee(actor: RequestUser) {
    const employees = await this.prisma.employee.findMany({
      where: employeeScopeWhere(actor),
      orderBy: { fullName: "asc" },
      select: {
        id: true, fullName: true, localMatricule: true, biotimeCode: true, employeeCode: true, department: true,
        overtimeDeclarations: { select: { hours: true, rateType: true, status: true } }
      }
    });
    return employees.map(employee => {
      const totals = { rate50: 0, rate75: 0, rate100: 0, total: 0 };
      for (const declaration of employee.overtimeDeclarations) {
        const hours = Number(declaration.hours);
        totals.total += hours;
        if (declaration.rateType === "RATE_75") totals.rate75 += hours;
        else if (declaration.rateType === "RATE_100") totals.rate100 += hours;
        else totals.rate50 += hours;
      }
      return {
        employee: { id: employee.id, fullName: employee.fullName, localMatricule: employee.localMatricule, biotimeCode: employee.biotimeCode, employeeCode: employee.employeeCode, department: employee.department },
        declarationCount: employee.overtimeDeclarations.length,
        pendingCount: employee.overtimeDeclarations.filter(row => row.status === ApprovalStatus.PENDING_APPROVAL).length,
        ...totals
      };
    });
  }

  async deleteSickLeave(id: string, actor: RequestUser) {
    this.ensureAdmin(actor);
    const row = await this.prisma.sickLeaveDeclaration.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, fullName: true, localMatricule: true, biotimeCode: true, employeeCode: true, department: true } },
        declaredBy: { select: { id: true, username: true, fullName: true } }
      }
    });
    if (!row) throw new NotFoundException("Déclaration maladie introuvable.");
    await this.prisma.sickLeaveDeclaration.delete({ where: { id } });
    await this.audit.record({ userId: actor.id, action: "sick_leave.delete", entityType: "sick_leave_declaration", entityId: id, before: row as Prisma.InputJsonValue });
    return { ok: true };
  }

  async updateSickLeave(id: string, dto: UpdateSickLeaveDeclarationDto, actor: RequestUser) {
    const before = await this.prisma.sickLeaveDeclaration.findUnique({ where: { id }, include: this.sickLeaveDeclarationInclude() });
    if (!before) throw new NotFoundException("Declaration maladie introuvable.");
    this.ensureOwner(before.declaredById, actor);
    if (dto.dateEnd < dto.dateStart) throw new BadRequestException("La date de fin doit etre apres la date de debut.");
    await this.ensureEmployeeVisible(before.employeeId, actor);
    const approval = this.approvalFor(actor);
    const row = await this.prisma.sickLeaveDeclaration.update({
      where: { id },
      data: {
        dateStart: parseDate(dto.dateStart), dateEnd: parseDate(dto.dateEnd), note: dto.note?.trim() || null,
        status: approval.status, approvedById: approval.status === ApprovalStatus.APPROVED ? actor.id : null,
        approvedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null
      },
      include: this.sickLeaveDeclarationInclude()
    });
    await this.audit.record({ userId: actor.id, action: "sick_leave.update", entityType: "sick_leave_declaration", entityId: id, before: before as Prisma.InputJsonValue, after: row as Prisma.InputJsonValue });
    if (row.status === ApprovalStatus.PENDING_APPROVAL) await this.notifyPending(row, "Maladie modifiee a valider", "sick_leave_declaration");
    return row;
  }

  async listLeaves(actor: RequestUser, employeeId?: string) {
    const where: Prisma.LeaveDeclarationWhereInput = {
      employee: employeeScopeWhere(actor)
    };
    if (employeeId) {
      await this.ensureEmployeeVisible(employeeId, actor);
      where.employeeId = employeeId;
    }
    return this.prisma.leaveDeclaration.findMany({
      where,
      orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
      take: 300,
      include: this.leaveDeclarationInclude()
    });
  }

  async deleteLeave(id: string, actor: RequestUser) {
    this.ensureAdmin(actor);
    const row = await this.prisma.leaveDeclaration.findUnique({
      where: { id },
      include: this.leaveDeclarationInclude()
    });
    if (!row) throw new NotFoundException("Déclaration congé introuvable.");
    await this.prisma.leaveDeclaration.delete({ where: { id } });
    if (row.leaveType === LeaveType.ANNUEL) {
      await this.recalculateAnnualLeaveBalances(row.employeeId, row.dateStart, row.dateEnd);
    }
    await this.prisma.attendanceSummaryRecord.deleteMany({
      where: {
        employeeId: row.employeeId,
        workDate: { gte: row.dateStart, lte: row.dateEnd },
        status: "LEAVE"
      }
    });
    await this.audit.record({ userId: actor.id, action: "leave.delete", entityType: "leave_declaration", entityId: id, before: row as Prisma.InputJsonValue });
    return { ok: true };
  }

  async updateLeave(id: string, dto: UpdateLeaveDeclarationDto, actor: RequestUser) {
    const before = await this.prisma.leaveDeclaration.findUnique({ where: { id }, include: this.leaveDeclarationInclude() });
    if (!before) throw new NotFoundException("Declaration conge introuvable.");
    this.ensureOwner(before.declaredById, actor);
    if (dto.dateEnd < dto.dateStart) throw new BadRequestException("La date de fin doit etre apres la date de debut.");
    await this.ensureEmployeeVisible(before.employeeId, actor);
    const dateStart = parseDate(dto.dateStart);
    const dateEnd = parseDate(dto.dateEnd);
    const exceptionalReason = dto.leaveType === LeaveType.EXCEPTIONNEL ? dto.exceptionalReason || null : null;
    await this.validateLeaveRules(before.employeeId, dateStart, dateEnd, dto.leaveType, exceptionalReason, dto.note, actor, id);
    const approval = this.approvalFor(actor);
    const row = await this.prisma.leaveDeclaration.update({
      where: { id },
      data: {
        dateStart, dateEnd, leaveType: dto.leaveType, exceptionalReason, note: dto.note?.trim() || null,
        status: approval.status, approvedById: approval.status === ApprovalStatus.APPROVED ? actor.id : null,
        approvedAt: approval.status === ApprovalStatus.APPROVED ? new Date() : null
      },
      include: this.leaveDeclarationInclude()
    });
    const balanceStart = before.dateStart < dateStart ? before.dateStart : dateStart;
    const balanceEnd = before.dateEnd > dateEnd ? before.dateEnd : dateEnd;
    await this.recalculateAnnualLeaveBalances(before.employeeId, balanceStart, balanceEnd);
    await this.audit.record({ userId: actor.id, action: "leave.update", entityType: "leave_declaration", entityId: id, before: before as Prisma.InputJsonValue, after: row as Prisma.InputJsonValue });
    if (row.status === ApprovalStatus.PENDING_APPROVAL) await this.notifyPending(row, "Conge modifie a valider", "leave_declaration");
    return row;
  }

  async listAbsenceReversals(actor: RequestUser, employeeId?: string) {
    const where: Prisma.AbsenceReversalRequestWhereInput = {
      employee: employeeScopeWhere(actor)
    };
    if (employeeId) {
      await this.ensureEmployeeVisible(employeeId, actor);
      where.employeeId = employeeId;
    }
    return this.prisma.absenceReversalRequest.findMany({
      where,
      orderBy: [{ absenceDate: "desc" }, { createdAt: "desc" }],
      take: 300,
      include: this.absenceReversalInclude()
    });
  }

  approveOvertime(id: string, actor: RequestUser) {
    this.ensureApprover(actor);
    return this.approve("overtime", id, actor);
  }

  rejectOvertime(id: string, reason: string | undefined, actor: RequestUser) {
    this.ensureApprover(actor);
    return this.reject("overtime", id, reason, actor);
  }

  approveCompensation(id: string, actor: RequestUser) {
    this.ensureApprover(actor);
    return this.approve("compensation", id, actor);
  }

  rejectCompensation(id: string, reason: string | undefined, actor: RequestUser) {
    this.ensureApprover(actor);
    return this.reject("compensation", id, reason, actor);
  }

  approveLeave(id: string, actor: RequestUser) {
    this.ensureApprover(actor);
    return this.approve("leave", id, actor);
  }

  approveSickLeave(id: string, actor: RequestUser) {
    this.ensureApprover(actor);
    return this.approve("sick_leave", id, actor);
  }

  rejectSickLeave(id: string, reason: string | undefined, actor: RequestUser) {
    this.ensureApprover(actor);
    return this.reject("sick_leave", id, reason, actor);
  }

  rejectLeave(id: string, reason: string | undefined, actor: RequestUser) {
    this.ensureApprover(actor);
    return this.reject("leave", id, reason, actor);
  }

  approveAbsenceReversal(id: string, actor: RequestUser) {
    this.ensureApprover(actor);
    return this.approve("absence_reversal", id, actor);
  }

  rejectAbsenceReversal(id: string, reason: string | undefined, actor: RequestUser) {
    this.ensureApprover(actor);
    return this.reject("absence_reversal", id, reason, actor);
  }

  private async approve(type: "overtime" | "compensation" | "sick_leave" | "leave" | "absence_reversal", id: string, actor: RequestUser) {
    const model = type === "overtime"
      ? this.prisma.overtimeDeclaration
      : type === "compensation"
        ? this.prisma.absenceCompensation
        : type === "sick_leave"
          ? this.prisma.sickLeaveDeclaration
        : type === "leave"
          ? this.prisma.leaveDeclaration
          : this.prisma.absenceReversalRequest;
    const row = await (model as any).update({
      where: { id },
      data: { status: ApprovalStatus.APPROVED, approvedById: actor.id, approvedAt: new Date() },
      include: type === "sick_leave" ? this.sickLeaveDeclarationInclude() : type === "leave" ? this.leaveDeclarationInclude() : type === "absence_reversal" ? this.absenceReversalInclude() : this.declarationInclude()
    }).catch(() => null);
    if (!row) throw new NotFoundException("Déclaration introuvable.");
    if (type === "leave" && row.leaveType === LeaveType.ANNUEL) {
      await this.recalculateAnnualLeaveBalances(row.employeeId, row.dateStart, row.dateEnd);
    }
    await this.audit.record({ userId: actor.id, action: `${type}.approve`, entityType: type, entityId: id });
    await this.notifications.notify([row.declaredById], NotificationType.APPROVAL_RESULT, {
      title: "Déclaration approuvée",
      message: `${declarationTypeLabel(type)} approuvée pour ${row.employee.fullName}.`,
      entityType: type,
      entityId: id
    });
    return row;
  }

  private async reject(type: "overtime" | "compensation" | "sick_leave" | "leave" | "absence_reversal", id: string, reason: string | undefined, actor: RequestUser) {
    const model = type === "overtime"
      ? this.prisma.overtimeDeclaration
      : type === "compensation"
        ? this.prisma.absenceCompensation
        : type === "sick_leave"
          ? this.prisma.sickLeaveDeclaration
        : type === "leave"
          ? this.prisma.leaveDeclaration
          : this.prisma.absenceReversalRequest;
    const data: Record<string, unknown> = {
      status: ApprovalStatus.REJECTED,
      approvedById: actor.id,
      approvedAt: new Date()
    };
    if (type === "overtime" && reason) data.reason = reason;
    if ((type === "compensation" || type === "sick_leave" || type === "leave") && reason) data.note = reason;
    const row = await (model as any).update({
      where: { id },
      data,
      include: type === "sick_leave" ? this.sickLeaveDeclarationInclude() : type === "leave" ? this.leaveDeclarationInclude() : type === "absence_reversal" ? this.absenceReversalInclude() : this.declarationInclude()
    }).catch(() => null);
    if (!row) throw new NotFoundException("Déclaration introuvable.");
    if (type === "leave" && row.leaveType === LeaveType.ANNUEL) {
      await this.recalculateAnnualLeaveBalances(row.employeeId, row.dateStart, row.dateEnd);
    }
    await this.audit.record({ userId: actor.id, action: `${type}.reject`, entityType: type, entityId: id, metadata: { reason: reason || null } });
    await this.notifications.notify([row.declaredById], NotificationType.APPROVAL_RESULT, {
      title: "Déclaration rejetée",
      message: `${declarationTypeLabel(type)} rejetée pour ${row.employee.fullName}.${reason ? ` Motif: ${reason}` : ""}`,
      entityType: type,
      entityId: id
    });
    return row;
  }

  private approvalFor(actor: RequestUser) {
    const roles = new Set(actor.roles);
    return { status: roles.has(RoleCode.Admin) || roles.has(RoleCode.DRH) ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING_APPROVAL };
  }

  private ensureOvertimeOrCompensationDeclarer(actor: RequestUser) {
    const roles = new Set(actor.roles);
    if (!roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH) && !roles.has(RoleCode.ResponsableDepartement) && !roles.has(RoleCode.Supervisor)) {
      throw new BadRequestException("Rôle non autorisé pour cette déclaration.");
    }
  }

  private ensureSickLeaveDeclarer(actor: RequestUser) {
    const roles = new Set(actor.roles);
    if (!roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH) && !roles.has(RoleCode.GRH)) {
      throw new BadRequestException("Seuls GRH, Admin ou DRH peuvent déclarer une maladie.");
    }
  }

  private ensureLeaveDeclarer(actor: RequestUser) {
    const roles = new Set(actor.roles);
    if (!roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH) && !roles.has(RoleCode.GRH) && !roles.has(RoleCode.ResponsableDepartement) && !roles.has(RoleCode.Supervisor)) {
      throw new BadRequestException("Rôle non autorisé pour cette déclaration congé.");
    }
  }

  private ensureAbsenceReversalDeclarer(actor: RequestUser) {
    const roles = new Set(actor.roles);
    if (!roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH) && !roles.has(RoleCode.ResponsableDepartement) && !roles.has(RoleCode.Supervisor)) {
      throw new BadRequestException("Rôle non autorisé pour demander une annulation d'absence.");
    }
  }

  private ensureApprover(actor: RequestUser) {
    const roles = new Set(actor.roles);
    if (!roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH)) {
      throw new BadRequestException("Seul un Admin ou un DRH peut approuver/rejeter.");
    }
  }

  private ensureOwner(declaredById: string | null, actor: RequestUser) {
    if (declaredById !== actor.id) throw new ForbiddenException("Seul le createur peut modifier cette declaration.");
  }

  private ensureAdmin(actor: RequestUser) {
    const roles = new Set(actor.roles);
    if (!roles.has(RoleCode.Admin)) {
      throw new BadRequestException("Seul l'admin peut supprimer cette déclaration.");
    }
  }

  private async ensureEmployeeVisible(employeeId: string, actor: RequestUser) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, attendanceTrackingExempt: false, ...employeeScopeWhere(actor) }, select: { id: true } });
    if (!employee) throw new NotFoundException("Employé introuvable ou non autorisé.");
  }

  private countPresencePunches(employeeId: string, date: string) {
    return this.prisma.attendancePunch.count({
      where: {
        employeeId,
        countsAsPresence: true,
        punchTime: { gte: parseDate(date), lt: parseDate(addDays(date, 1)) }
      }
    });
  }

  private declarationInclude() {
    return {
      employee: { select: { id: true, fullName: true, localMatricule: true, biotimeCode: true, employeeCode: true } },
      declaredBy: { select: { id: true, username: true, fullName: true } },
      approvedBy: { select: { id: true, username: true, fullName: true } }
    } as const;
  }

  private leaveDeclarationInclude() {
    return {
      employee: { select: { id: true, fullName: true, localMatricule: true, biotimeCode: true, employeeCode: true, department: true } },
      declaredBy: { select: { id: true, username: true, fullName: true } },
      approvedBy: { select: { id: true, username: true, fullName: true } }
    } as const;
  }

  private sickLeaveDeclarationInclude() {
    return {
      employee: { select: { id: true, fullName: true, localMatricule: true, biotimeCode: true, employeeCode: true, department: true } },
      declaredBy: { select: { id: true, username: true, fullName: true } },
      approvedBy: { select: { id: true, username: true, fullName: true } }
    } as const;
  }

  private async validateLeaveRules(employeeId: string, dateStart: Date, dateEnd: Date, leaveType: LeaveType, exceptionalReason: ExceptionalLeaveReason | null, note: string | undefined, actor: RequestUser, excludeId?: string) {
    const exactDuplicate = await this.prisma.leaveDeclaration.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        employeeId,
        dateStart,
        dateEnd,
        status: { not: ApprovalStatus.REJECTED }
      },
      select: { id: true, status: true }
    });
    if (exactDuplicate) {
      throw new BadRequestException("Un congé existe déjà pour cet employé avec exactement les mêmes dates. Création en double interdite.");
    }
    const duration = daysInclusive(dateStart, dateEnd);
    const canOverride = this.canOverrideSensitiveLeaveRule(actor) && Boolean(note?.trim());
    if (leaveType === LeaveType.EXCEPTIONNEL && !exceptionalReason) {
      throw new BadRequestException("Le motif exceptionnel est obligatoire pour un congé exceptionnel.");
    }
    if (leaveType !== LeaveType.EXCEPTIONNEL && exceptionalReason) {
      throw new BadRequestException("Le motif exceptionnel n'est accepté que pour un congé exceptionnel.");
    }
    if (leaveType === LeaveType.EXCEPTIONNEL && exceptionalReason !== ExceptionalLeaveReason.HAJJ && duration > 3 && !canOverride) {
      throw new BadRequestException("Le congé exceptionnel est limité à 3 jours. Seul un Admin/DRH peut dépasser cette durée avec justification en note.");
    }
    if (leaveType === LeaveType.EXCEPTIONNEL && exceptionalReason === ExceptionalLeaveReason.HAJJ) {
      const existing = await this.prisma.leaveDeclaration.count({
        where: {
          ...(excludeId ? { id: { not: excludeId } } : {}),
          employeeId,
          leaveType: LeaveType.EXCEPTIONNEL,
          exceptionalReason: ExceptionalLeaveReason.HAJJ,
          status: ApprovalStatus.APPROVED
        }
      });
      if (existing > 0 && !canOverride) {
        throw new BadRequestException("Le congé Hajj payé n'est accordé qu'une seule fois dans la carrière. Seul un Admin/DRH peut forcer avec justification en note.");
      }
    }
    if (leaveType === LeaveType.SANS_SOLDE) {
      const years = yearsBetween(dateStart, dateEnd);
      for (const year of years) {
        const yearStart = new Date(Date.UTC(year, 0, 1));
        const yearEnd = new Date(Date.UTC(year, 11, 31));
        const existing = await this.prisma.leaveDeclaration.findMany({
          where: {
            ...(excludeId ? { id: { not: excludeId } } : {}),
            employeeId,
            leaveType: LeaveType.SANS_SOLDE,
            status: ApprovalStatus.APPROVED,
            dateStart: { lte: yearEnd },
            dateEnd: { gte: yearStart }
          },
          select: { dateStart: true, dateEnd: true }
        });
        const existingDays = existing.reduce((sum, row) => sum + overlapDays(row.dateStart, row.dateEnd, yearStart, yearEnd), 0);
        const requestedDays = overlapDays(dateStart, dateEnd, yearStart, yearEnd);
        if (existingDays + requestedDays > 10 && !canOverride) {
          throw new BadRequestException(`Le congé sans solde dépasse 10 jours sur ${year}. Seul un Admin/DRH peut forcer avec justification en note.`);
        }
      }
    }
  }

  private canOverrideSensitiveLeaveRule(actor: RequestUser) {
    const roles = new Set(actor.roles);
    return roles.has(RoleCode.Admin) || roles.has(RoleCode.DRH);
  }

  private async recalculateAnnualLeaveBalances(employeeId: string, dateStart: Date, dateEnd: Date) {
    for (const year of yearsBetween(dateStart, dateEnd)) {
      await this.recalculateAnnualLeaveBalance(employeeId, year);
    }
  }

  private async recalculateAnnualLeaveBalance(employeeId: string, year: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        group: { select: { subUnit: { select: { isSouthWilaya: true, unit: { select: { isSouthWilaya: true } } } } } }
      }
    });
    if (!employee) throw new NotFoundException("Employé introuvable.");
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const leaves = await this.prisma.leaveDeclaration.findMany({
      where: {
        employeeId,
        leaveType: LeaveType.ANNUEL,
        status: ApprovalStatus.APPROVED,
        dateStart: { lte: yearEnd },
        dateEnd: { gte: yearStart }
      },
      select: { dateStart: true, dateEnd: true }
    });
    const daysTaken = leaves.reduce((sum, row) => sum + overlapDays(row.dateStart, row.dateEnd, yearStart, yearEnd), 0);
    const daysEntitled = employee.group?.subUnit?.isSouthWilaya || employee.group?.subUnit?.unit?.isSouthWilaya ? 40 : 30;
    const daysRemaining = daysEntitled - daysTaken;
    return this.prisma.annualLeaveBalance.upsert({
      where: { employeeId_year: { employeeId, year } },
      update: {
        daysEntitled: new Prisma.Decimal(daysEntitled),
        daysTaken: new Prisma.Decimal(daysTaken),
        daysRemaining: new Prisma.Decimal(daysRemaining),
        calculatedAt: new Date()
      },
      create: {
        employeeId,
        year,
        daysEntitled: new Prisma.Decimal(daysEntitled),
        daysTaken: new Prisma.Decimal(daysTaken),
        daysRemaining: new Prisma.Decimal(daysRemaining),
        calculatedAt: new Date()
      }
    });
  }

  private absenceReversalInclude() {
    return {
      employee: { select: { id: true, fullName: true, localMatricule: true, biotimeCode: true, employeeCode: true, department: true } },
      declaredBy: { select: { id: true, username: true, fullName: true } },
      approvedBy: { select: { id: true, username: true, fullName: true } }
    } as const;
  }

  private manualAbsenceInclude() {
    return {
      employee: { select: { id: true, fullName: true, localMatricule: true, biotimeCode: true, employeeCode: true, department: true } },
      declaredBy: { select: { id: true, username: true, fullName: true } },
      approvedBy: { select: { id: true, username: true, fullName: true } }
    } as const;
  }

  private async notifyPending(row: { id: string; employee: { fullName: string } }, title: string, entityType: string) {
    await this.notifications.notify(await this.notifications.adminDrhUserIds(), NotificationType.PENDING_APPROVAL, {
      title, message: row.employee.fullName, entityType, entityId: row.id
    });
  }

}

function parseDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(dateKey: string, days: number) {
  const date = parseDate(dateKey);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysInclusive(start: Date, end: Date) {
  return Math.floor((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / 86400000) + 1;
}

function overlapDays(start: Date, end: Date, boundaryStart: Date, boundaryEnd: Date) {
  const from = start > boundaryStart ? start : boundaryStart;
  const to = end < boundaryEnd ? end : boundaryEnd;
  if (to < from) return 0;
  return daysInclusive(from, to);
}

function yearsBetween(start: Date, end: Date) {
  const years: number[] = [];
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    years.push(year);
  }
  return years;
}

function ratePercent(rateType: string) {
  if (rateType === "RATE_75") return 75;
  if (rateType === "RATE_100") return 100;
  return 50;
}

function declarationTypeLabel(type: "overtime" | "compensation" | "sick_leave" | "leave" | "absence_reversal") {
  if (type === "overtime") return "Heures supplémentaires";
  if (type === "leave") return "Congé";
  if (type === "sick_leave") return "Maladie";
  if (type === "absence_reversal") return "Annulation d'absence sans preuve de pointage";
  return "Compensation";
}
