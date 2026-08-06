import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions(PermissionCode.UsersRead)
  list() {
    return this.users.list();
  }

  @Get(":id")
  @Permissions(PermissionCode.UsersRead)
  get(@Param("id") id: string) {
    return this.users.get(id);
  }

  @Post()
  @Permissions(PermissionCode.UsersManage)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: RequestUser) {
    return this.users.create(dto, actor);
  }

  @Patch(":id")
  @Permissions(PermissionCode.UsersManage)
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: RequestUser) {
    return this.users.update(id, dto, actor);
  }

  @Patch(":id/org-access")
  @Permissions(PermissionCode.UsersManage)
  updateOrgAccess(@Param("id") id: string, @Body() dto: { subUnitIds?: string[] }, @CurrentUser() actor: RequestUser) {
    return this.users.updateOrgAccess(id, dto.subUnitIds || [], actor);
  }

  @Delete(":id")
  @Permissions(PermissionCode.UsersManage)
  deactivate(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.users.deactivate(id, actor);
  }
}
