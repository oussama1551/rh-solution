import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { AttendanceBlocksService } from "./attendance-blocks.service";
import { AttendanceFlagsService } from "./attendance-flags.service";
import { AttendancePunchesService } from "./attendance-punches.service";
import { AssignShiftsDto } from "./dto/assign-shifts.dto";
import { BatchAssignShiftsDto } from "./dto/batch-assign-shifts.dto";
import { CreateAttendanceBlockDto } from "./dto/create-attendance-block.dto";
import { RejectAttendanceFlagDto } from "./dto/reject-attendance-flag.dto";
import { ShiftPlanningService } from "./shift-planning.service";
import { ManualDeclarationsService } from "./manual-declarations.service";
import { PresumedAbsenceService } from "./presumed-absence.service";
import { CreateAbsenceCompensationDto, CreateAbsenceReversalRequestDto, CreateLeaveDeclarationDto, CreateOvertimeDeclarationDto, CreateSickLeaveDeclarationDto } from "./dto/manual-declarations.dto";

@Controller("attendance")
export class AttendanceController {
  constructor(
    private readonly flags: AttendanceFlagsService,
    private readonly blocks: AttendanceBlocksService,
    private readonly punches: AttendancePunchesService,
    private readonly planning: ShiftPlanningService,
    private readonly declarations: ManualDeclarationsService,
    private readonly presumedAbsences: PresumedAbsenceService
  ) {}

  @Get("shift-definitions")
  @Permissions(PermissionCode.AttendanceRead)
  shiftDefinitions() {
    return this.planning.definitions();
  }

  @Post("shift-assignments")
  @Permissions(PermissionCode.ShiftsManage)
  assignShifts(@Body() dto: AssignShiftsDto, @CurrentUser() user: RequestUser) {
    return this.planning.assign(dto, user);
  }

  @Get("shift-planning")
  @Permissions(PermissionCode.AttendanceRead)
  shiftPlanning(
    @CurrentUser() user: RequestUser,
    @Query("employeeId") employeeId?: string,
    @Query("groupId") groupId?: string,
    @Query("period") period?: string
  ) {
    return this.planning.planningState({ employeeId, groupId, period }, user);
  }

  @Get("shift-planning/print")
  @Permissions(PermissionCode.AttendanceRead)
  shiftPlanningPrint(
    @CurrentUser() user: RequestUser,
    @Query("groupId") groupId?: string,
    @Query("subUnitId") subUnitId?: string,
    @Query("period") period?: string
  ) {
    return this.planning.printPlanning({ groupId, subUnitId, period }, user);
  }

  @Post("shift-assignments/batch")
  @Permissions(PermissionCode.ShiftsManage)
  batchAssignShifts(@Body() dto: BatchAssignShiftsDto, @CurrentUser() user: RequestUser) {
    return this.planning.batchAssign(dto, user);
  }

  @Get("planning-approvals")
  @Permissions(PermissionCode.AttendanceManage)
  planningApprovals() {
    return this.planning.pendingApprovals();
  }

  @Patch("planning-approvals/:id/approve")
  @Permissions(PermissionCode.AttendanceManage)
  approvePlanning(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.planning.approvePlanning(id, user);
  }

  @Patch("planning-approvals/:id/reject")
  @Permissions(PermissionCode.AttendanceManage)
  rejectPlanning(@Param("id") id: string, @Body() dto: { reason?: string }, @CurrentUser() user: RequestUser) {
    return this.planning.rejectPlanning(id, dto.reason, user);
  }

  @Get("employees/:id/shift-assignments")
  @Permissions(PermissionCode.AttendanceRead)
  employeeShiftAssignments(@Param("id") id: string, @Query("month") month?: string) {
    return this.planning.employeeAssignments(id, month);
  }

  @Get("punches")
  @Permissions(PermissionCode.AttendanceRead)
  listPunches(
    @Query("search") search?: string,
    @Query("department") department?: string,
    @Query("direction") direction?: string,
    @Query("shiftStatus") shiftStatus?: string,
    @Query("employeeStatus") employeeStatus?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
    @CurrentUser() actor?: RequestUser
  ) {
    return this.punches.listDetailed({ search, department, direction, shiftStatus, employeeStatus, from, to, limit }, actor);
  }

  @Get("daily")
  @Permissions(PermissionCode.AttendanceRead)
  listDaily(
    @Query("search") search?: string,
    @Query("department") department?: string,
    @Query("employeeStatus") employeeStatus?: string,
    @Query("timing") timing?: string,
    @Query("shiftType") shiftType?: string,
    @Query("unitId") unitId?: string,
    @Query("subUnitId") subUnitId?: string,
    @Query("groupId") groupId?: string,
    @Query("employeeId") employeeId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("month") month?: string,
    @CurrentUser() actor?: RequestUser
  ) {
    return this.punches.listDaily({ search, department, employeeStatus, timing, shiftType, unitId, subUnitId, groupId, employeeId, from, to, month }, actor);
  }

  @Get("employees/:id/monthly-calendar")
  @Permissions(PermissionCode.AttendanceRead)
  employeeMonthlyCalendar(@Param("id") id: string, @Query("month") month?: string, @CurrentUser() actor?: RequestUser) {
    return this.punches.employeeMonthlyCalendar(id, month || new Date().toISOString().slice(0, 7), actor);
  }

  @Get("presumed-absences")
  @Permissions(PermissionCode.AttendanceRead)
  presumedAbsenceList(
    @Query("status") status: string | undefined,
    @Query("date") date: string | undefined,
    @Query("search") search: string | undefined,
    @CurrentUser() actor: RequestUser
  ) {
    return this.presumedAbsences.list({ status, date, search }, actor);
  }

  @Post("presumed-absences/detect")
  @Permissions(PermissionCode.AttendanceRead)
  detectPresumedAbsences(@Query("date") date?: string) {
    return this.presumedAbsences.detectForToday(new Date(), date);
  }

  @Patch("presumed-absences/:id/confirm")
  @Permissions(PermissionCode.AttendanceRead)
  confirmPresumedAbsence(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.presumedAbsences.confirm(id, actor);
  }

  @Patch("presumed-absences/:id/reject")
  @Permissions(PermissionCode.AttendanceRead)
  rejectPresumedAbsence(@Param("id") id: string, @Body() dto: { reason?: string }, @CurrentUser() actor: RequestUser) {
    return this.presumedAbsences.reject(id, actor, dto.reason);
  }

  @Get("flags/pending")
  @Permissions(PermissionCode.AttendanceManage)
  listPendingFlags() {
    return this.flags.listPending();
  }

  @Patch("flags/:id/validate")
  @Permissions(PermissionCode.AttendanceManage)
  validateFlag(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.flags.validate(id, user.id);
  }

  @Patch("flags/:id/reject")
  @Permissions(PermissionCode.AttendanceManage)
  rejectFlag(@Param("id") id: string, @Body() dto: RejectAttendanceFlagDto, @CurrentUser() user: RequestUser) {
    return this.flags.reject(id, user.id, dto.reason);
  }

  @Get("blocks")
  @Permissions(PermissionCode.AttendanceBlocksManage)
  listBlocks() {
    return this.blocks.listActiveAndScheduled();
  }

  @Post("blocks")
  @Permissions(PermissionCode.AttendanceBlocksManage)
  createBlock(@Body() dto: CreateAttendanceBlockDto, @CurrentUser() user: RequestUser) {
    return this.blocks.create({
      employeeId: dto.employeeId,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      reason: dto.reason,
      createdById: user.id
    });
  }

  @Patch("blocks/:id/cancel")
  @Permissions(PermissionCode.AttendanceBlocksManage)
  cancelBlock(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.blocks.cancel(id, user.id);
  }

  @Post("declarations/overtime")
  @Permissions(PermissionCode.AttendanceRead)
  createOvertime(@Body() dto: CreateOvertimeDeclarationDto, @CurrentUser() user: RequestUser) {
    return this.declarations.createOvertime(dto, user);
  }

  @Get("declarations/overtime")
  @Permissions(PermissionCode.AttendanceRead)
  listOvertime(@CurrentUser() user: RequestUser, @Query("employeeId") employeeId?: string) {
    return this.declarations.listOvertime(user, employeeId);
  }

  @Delete("declarations/overtime/:id")
  @Permissions(PermissionCode.AttendanceRead)
  deleteOvertime(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.declarations.deleteOvertime(id, user);
  }

  @Post("declarations/compensations")
  @Permissions(PermissionCode.AttendanceRead)
  createCompensation(@Body() dto: CreateAbsenceCompensationDto, @CurrentUser() user: RequestUser) {
    return this.declarations.createCompensation(dto, user);
  }

  @Post("declarations/absence-reversals")
  @Permissions(PermissionCode.AttendanceRead)
  createAbsenceReversal(@Body() dto: CreateAbsenceReversalRequestDto, @CurrentUser() user: RequestUser) {
    return this.declarations.createAbsenceReversal(dto, user);
  }

  @Get("declarations/absence-reversals")
  @Permissions(PermissionCode.AttendanceRead)
  listAbsenceReversals(@CurrentUser() user: RequestUser, @Query("employeeId") employeeId?: string) {
    return this.declarations.listAbsenceReversals(user, employeeId);
  }

  @Post("declarations/sick-leaves")
  @Permissions(PermissionCode.AttendanceRead)
  createSickLeave(@Body() dto: CreateSickLeaveDeclarationDto, @CurrentUser() user: RequestUser) {
    return this.declarations.createSickLeave(dto, user);
  }

  @Get("declarations/sick-leaves")
  @Permissions(PermissionCode.AttendanceRead)
  listSickLeaves(@CurrentUser() user: RequestUser, @Query("employeeId") employeeId?: string) {
    return this.declarations.listSickLeaves(user, employeeId);
  }

  @Delete("declarations/sick-leaves/:id")
  @Permissions(PermissionCode.AttendanceRead)
  deleteSickLeave(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.declarations.deleteSickLeave(id, user);
  }

  @Post("declarations/leaves")
  @Permissions(PermissionCode.AttendanceRead)
  createLeave(@Body() dto: CreateLeaveDeclarationDto, @CurrentUser() user: RequestUser) {
    return this.declarations.createLeave(dto, user);
  }

  @Get("declarations/leaves/balance")
  @Permissions(PermissionCode.AttendanceRead)
  annualLeaveBalance(@CurrentUser() user: RequestUser, @Query("employeeId") employeeId: string, @Query("year") year?: string) {
    return this.declarations.annualLeaveBalance(employeeId, year ? Number(year) : undefined, user);
  }

  @Get("declarations/leaves")
  @Permissions(PermissionCode.AttendanceRead)
  listLeaves(@CurrentUser() user: RequestUser, @Query("employeeId") employeeId?: string) {
    return this.declarations.listLeaves(user, employeeId);
  }

  @Delete("declarations/leaves/:id")
  @Permissions(PermissionCode.AttendanceRead)
  deleteLeave(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.declarations.deleteLeave(id, user);
  }

  @Get("declarations/pending")
  @Permissions(PermissionCode.AttendanceManage)
  pendingDeclarations() {
    return this.declarations.pendingApprovals();
  }

  @Patch("declarations/overtime/:id/approve")
  @Permissions(PermissionCode.AttendanceManage)
  approveOvertime(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.declarations.approveOvertime(id, user);
  }

  @Patch("declarations/overtime/:id/reject")
  @Permissions(PermissionCode.AttendanceManage)
  rejectOvertime(@Param("id") id: string, @Body() dto: { reason?: string }, @CurrentUser() user: RequestUser) {
    return this.declarations.rejectOvertime(id, dto.reason, user);
  }

  @Patch("declarations/compensations/:id/approve")
  @Permissions(PermissionCode.AttendanceManage)
  approveCompensation(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.declarations.approveCompensation(id, user);
  }

  @Patch("declarations/compensations/:id/reject")
  @Permissions(PermissionCode.AttendanceManage)
  rejectCompensation(@Param("id") id: string, @Body() dto: { reason?: string }, @CurrentUser() user: RequestUser) {
    return this.declarations.rejectCompensation(id, dto.reason, user);
  }

  @Patch("declarations/leaves/:id/approve")
  @Permissions(PermissionCode.AttendanceManage)
  approveLeave(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.declarations.approveLeave(id, user);
  }

  @Patch("declarations/leaves/:id/reject")
  @Permissions(PermissionCode.AttendanceManage)
  rejectLeave(@Param("id") id: string, @Body() dto: { reason?: string }, @CurrentUser() user: RequestUser) {
    return this.declarations.rejectLeave(id, dto.reason, user);
  }

  @Patch("declarations/absence-reversals/:id/approve")
  @Permissions(PermissionCode.AttendanceManage)
  approveAbsenceReversal(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.declarations.approveAbsenceReversal(id, user);
  }

  @Patch("declarations/absence-reversals/:id/reject")
  @Permissions(PermissionCode.AttendanceManage)
  rejectAbsenceReversal(@Param("id") id: string, @Body() dto: { reason?: string }, @CurrentUser() user: RequestUser) {
    return this.declarations.rejectAbsenceReversal(id, dto.reason, user);
  }

}
