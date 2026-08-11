import { Body, Controller, Delete, Get, Param, Post, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { AdvancedTreatmentService, AdvancedTreatmentQuery } from "./advanced-treatment.service";

@Controller("advanced-treatment")
export class AdvancedTreatmentController {
  constructor(private readonly service: AdvancedTreatmentService) {}

  @Get()
  @Permissions(PermissionCode.ReportsRead)
  list(@Query() query: AdvancedTreatmentQuery, @CurrentUser() actor: RequestUser) {
    return this.service.list(query, actor);
  }

  @Post("refresh-sap-accounts")
  @Permissions(PermissionCode.ReportsRead)
  refreshSapAccounts(@CurrentUser() actor: RequestUser) {
    return this.service.refreshSapAccounts(actor);
  }

  @Post(":employeeId/confirm")
  @Permissions(PermissionCode.ReportsRead)
  confirm(@Param("employeeId") employeeId: string, @Query() query: AdvancedTreatmentQuery, @Body() body: { note?: string }, @CurrentUser() actor: RequestUser) {
    return this.service.confirm(employeeId, query, actor, body.note);
  }

  @Delete(":employeeId/confirm")
  @Permissions(PermissionCode.ReportsRead)
  unconfirm(@Param("employeeId") employeeId: string, @Query() query: AdvancedTreatmentQuery, @CurrentUser() actor: RequestUser) {
    return this.service.unconfirm(employeeId, query, actor);
  }

  @Post(":employeeId/freeze")
  @Permissions(PermissionCode.ReportsRead)
  freeze(@Param("employeeId") employeeId: string, @Query() query: AdvancedTreatmentQuery, @Body() body: { reason?: string }, @CurrentUser() actor: RequestUser) {
    return this.service.freeze(employeeId, query, actor, body.reason);
  }

  @Delete(":employeeId/freeze")
  @Permissions(PermissionCode.ReportsRead)
  unfreeze(@Param("employeeId") employeeId: string, @Query() query: AdvancedTreatmentQuery, @CurrentUser() actor: RequestUser) {
    return this.service.unfreeze(employeeId, query, actor);
  }

  @Get("export/excel")
  @Permissions(PermissionCode.ReportsExport)
  async exportExcel(@Query() query: AdvancedTreatmentQuery, @CurrentUser() actor: RequestUser, @Res() response: Response) {
    const buffer = await this.service.exportConfirmedExcel(query, actor);
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", "attachment; filename=\"traitement-avance-confirmes.xlsx\"");
    response.send(buffer);
  }

  @Get("export/frozen/excel")
  @Permissions(PermissionCode.ReportsExport)
  async exportFrozenExcel(@Query() query: AdvancedTreatmentQuery, @CurrentUser() actor: RequestUser, @Res() response: Response) {
    const buffer = await this.service.exportFrozenExcel(query, actor);
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", "attachment; filename=\"traitement-avance-refuses.xlsx\"");
    response.send(buffer);
  }

  @Get(":employeeId/calendar")
  @Permissions(PermissionCode.ReportsRead)
  calendar(@Param("employeeId") employeeId: string, @Query() query: AdvancedTreatmentQuery, @CurrentUser() actor: RequestUser) {
    return this.service.calendar(employeeId, query, actor);
  }
}
