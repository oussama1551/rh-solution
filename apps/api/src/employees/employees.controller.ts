import { Controller, Get, Param, Res } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { EmployeesService } from "./employees.service";

@Controller("employees")
@Permissions(PermissionCode.EmployeesRead)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser) {
    return this.employees.list(actor);
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.employees.get(id, actor);
  }

  @Get(":id/photo")
  async photo(@Param("id") id: string, @CurrentUser() actor: RequestUser, @Res() response: Response) {
    const asset = await this.employees.getBiotimePhoto(id, actor);

    response.setHeader("Content-Type", asset.contentType);
    response.setHeader("Cache-Control", "private, max-age=300");
    response.send(asset.buffer);
  }
}
