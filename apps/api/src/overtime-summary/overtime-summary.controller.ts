import { Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { OvertimeSummaryService } from "./overtime-summary.service";

@Controller("overtime-summary")
export class OvertimeSummaryController {
  constructor(private readonly service: OvertimeSummaryService) {}

  @Get()
  @Permissions(PermissionCode.ReportsRead)
  rows(@Query("startDate") startDate: string, @Query("endDate") endDate: string, @Query("search") search: string | undefined, @CurrentUser() actor: RequestUser) {
    return this.service.rows(startDate, endDate, search, actor);
  }

  @Post(":employeeId/confirm")
  @Permissions(PermissionCode.ReportsRead)
  confirm(@Param("employeeId") employeeId: string, @Query("startDate") startDate: string, @Query("endDate") endDate: string, @CurrentUser() actor: RequestUser) {
    return this.service.confirm(employeeId, startDate, endDate, actor);
  }

  @Delete(":employeeId/confirm")
  @Permissions(PermissionCode.ReportsRead)
  restore(@Param("employeeId") employeeId: string, @Query("startDate") startDate: string, @Query("endDate") endDate: string, @CurrentUser() actor: RequestUser) {
    return this.service.restore(employeeId, startDate, endDate, actor);
  }
}
