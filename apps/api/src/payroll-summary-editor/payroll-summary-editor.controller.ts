import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { PayrollSummaryEditorService } from "./payroll-summary-editor.service";

@Controller("payroll-summary-editor")
export class PayrollSummaryEditorController {
  constructor(private readonly editor: PayrollSummaryEditorService) {}

  @Get("motifs")
  @Permissions(PermissionCode.ReportsRead)
  motifs() { return this.editor.motifs(); }

  @Get("overrides")
  @Permissions(PermissionCode.ReportsRead)
  list(@Query("startDate") startDate: string, @Query("endDate") endDate: string, @CurrentUser() actor: RequestUser) {
    return this.editor.list(startDate, endDate, actor);
  }

  @Put("overrides/:employeeId/:workDate")
  @Permissions(PermissionCode.ReportsRead)
  save(@Param("employeeId") employeeId: string, @Param("workDate") workDate: string, @Query("startDate") startDate: string, @Query("endDate") endDate: string, @Body() body: { code?: string; note?: string }, @CurrentUser() actor: RequestUser) {
    return this.editor.save(employeeId, workDate, startDate, endDate, body, actor);
  }

  @Delete("overrides/:employeeId/:workDate")
  @Permissions(PermissionCode.ReportsRead)
  restore(@Param("employeeId") employeeId: string, @Param("workDate") workDate: string, @Query("startDate") startDate: string, @Query("endDate") endDate: string, @CurrentUser() actor: RequestUser) {
    return this.editor.restore(employeeId, workDate, startDate, endDate, actor);
  }

  @Get("confirmations")
  @Permissions(PermissionCode.ReportsRead)
  confirmations(@Query("startDate") startDate: string, @Query("endDate") endDate: string, @CurrentUser() actor: RequestUser) {
    return this.editor.confirmations(startDate, endDate, actor);
  }

  @Post("confirmations/:employeeId")
  @Permissions(PermissionCode.ReportsRead)
  confirm(@Param("employeeId") employeeId: string, @Query("startDate") startDate: string, @Query("endDate") endDate: string, @CurrentUser() actor: RequestUser) {
    return this.editor.confirm(employeeId, startDate, endDate, actor);
  }

  @Delete("confirmations/:employeeId")
  @Permissions(PermissionCode.ReportsRead)
  unconfirm(@Param("employeeId") employeeId: string, @Query("startDate") startDate: string, @Query("endDate") endDate: string, @CurrentUser() actor: RequestUser) {
    return this.editor.unconfirm(employeeId, startDate, endDate, actor);
  }
}
