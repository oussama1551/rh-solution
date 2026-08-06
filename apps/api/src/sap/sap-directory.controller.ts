import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { SapDirectoryService } from "./sap-directory.service";

@Controller("sap-directory")
@Permissions(PermissionCode.EmployeesManage)
export class SapDirectoryController {
  constructor(private readonly directory: SapDirectoryService) {}

  @Get()
  list(@Query("search") search?: string, @Query("company") company?: string, @Query("linked") linked?: string) {
    return this.directory.list({ search, company, linked });
  }

  @Get("biotime")
  biotime(@Query("search") search?: string, @Query("status") status?: string, @Query("sap") sap?: string) {
    return this.directory.listBiotime({ search, status, sap });
  }

  @Post("refresh")
  refresh(@CurrentUser() user: RequestUser) {
    return this.directory.refreshWithBiotime(user);
  }

  @Post("link")
  link(@Body() body: { sapEmpId?: string; employeeId?: string }) {
    return this.directory.linkManually({ sapEmpId: body.sapEmpId, employeeId: body.employeeId });
  }
}
