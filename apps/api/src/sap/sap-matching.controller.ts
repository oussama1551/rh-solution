import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { ManualMatchDto } from "./dto/manual-match.dto";
import { SapMatchingService } from "./sap-matching.service";

@Controller("sap-matching")
@Permissions(PermissionCode.EmployeesManage)
export class SapMatchingController {
  constructor(private readonly matching: SapMatchingService) {}

  @Get("directory")
  directory(@Query("search") search?: string) {
    return this.matching.sapDirectory(search || "");
  }

  @Get("queue")
  queue() {
    return this.matching.queue();
  }

  @Get("all")
  all(@Query("search") search?: string, @Query("company") company?: string, @Query("status") status?: string) {
    return this.matching.allMappings({ search, company, status });
  }

  @Get("cache-status")
  cacheStatus() {
    return this.matching.cacheStatus();
  }

  @Post("refresh-cache")
  @Permissions(PermissionCode.UsersManage)
  refreshCache() {
    return this.matching.refreshCache();
  }

  @Post("run-auto")
  runAuto(@CurrentUser() user: RequestUser) {
    return this.matching.runAutoMatching(user);
  }

  @Patch(":employeeId/confirm")
  confirm(@Param("employeeId") employeeId: string, @Body() dto: Partial<ManualMatchDto>, @CurrentUser() user: RequestUser) {
    return this.matching.confirm(employeeId, dto.sapEmpId, user);
  }

  @Patch(":employeeId/reject")
  reject(@Param("employeeId") employeeId: string, @Body() dto: ManualMatchDto, @CurrentUser() user: RequestUser) {
    return this.matching.reject(employeeId, dto.sapEmpId, user);
  }

  @Post(":employeeId/manual")
  manual(@Param("employeeId") employeeId: string, @Body() dto: ManualMatchDto, @CurrentUser() user: RequestUser) {
    return this.matching.confirm(employeeId, dto.sapEmpId, user);
  }

  @Patch(":employeeId/relink")
  relink(@Param("employeeId") employeeId: string, @Body() dto: ManualMatchDto, @CurrentUser() user: RequestUser) {
    return this.matching.relink(employeeId, dto.sapEmpId, user);
  }
}
