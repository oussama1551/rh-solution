import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { PermissionCode } from "../permissions/permission-codes";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";
import { RolesService } from "./roles.service";

@Controller("roles")
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Permissions(PermissionCode.RolesRead)
  listRoles() {
    return this.roles.listRoles();
  }

  @Get("permissions")
  @Permissions(PermissionCode.RolesRead)
  listPermissions() {
    return this.roles.listPermissions();
  }

  @Patch(":code/permissions")
  @Permissions(PermissionCode.RolesManage)
  updatePermissions(@Param("code") code: string, @Body() dto: UpdateRolePermissionsDto) {
    return this.roles.updateRolePermissions(code, dto);
  }
}
