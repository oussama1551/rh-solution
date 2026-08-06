import { Controller, Get, Post } from "@nestjs/common";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { PermissionCode } from "../permissions/permission-codes";
import { AdministrationService } from "./administration.service";

@Controller("administration")
export class AdministrationController {
  constructor(private readonly administration: AdministrationService) {}

  @Get("overview")
  @Permissions(PermissionCode.AdministrationRead)
  overview() {
    return this.administration.overview();
  }

  @Post("seed-defaults")
  @Permissions(PermissionCode.AdministrationManage)
  seedDefaults() {
    return this.administration.seedDefaults();
  }
}
