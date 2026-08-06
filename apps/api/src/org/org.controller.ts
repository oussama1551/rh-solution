import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import {
  CreateGroupDto,
  CreateSubUnitDto,
  CreateUnitDto,
  MoveEmployeesDto,
  MoveEmployeeDto,
  UpdateGroupDto,
  UpdateSubUnitDto,
  UpdateUnitDto
} from "./dto/org.dto";
import { OrgService } from "./org.service";

@Controller("org")
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get("tree")
  @Permissions(PermissionCode.OrgRead)
  tree(@CurrentUser() actor: RequestUser) {
    return this.org.tree(actor);
  }

  @Get("mapping-suggestions")
  @Permissions(PermissionCode.OrgRead)
  mappingSuggestions() {
    return this.org.departmentMappingSuggestions();
  }

  @Get("employees/search")
  @Permissions(PermissionCode.OrgRead)
  searchEmployees(@Query("q") q?: string) {
    return this.org.searchEmployees(q);
  }

  @Get("groups/:id/employees")
  @Permissions(PermissionCode.OrgRead)
  groupEmployees(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.org.listGroupEmployees(id, actor);
  }

  @Get("units")
  @Permissions(PermissionCode.OrgRead)
  listUnits() {
    return this.org.listUnits();
  }

  @Get("units/:id")
  @Permissions(PermissionCode.OrgRead)
  getUnit(@Param("id") id: string) {
    return this.org.getUnit(id);
  }

  @Post("units")
  @Permissions(PermissionCode.OrgStructureManage)
  createUnit(@Body() dto: CreateUnitDto, @CurrentUser() actor: RequestUser) {
    return this.org.createUnit(dto, actor);
  }

  @Patch("units/:id")
  @Permissions(PermissionCode.OrgStructureManage)
  updateUnit(@Param("id") id: string, @Body() dto: UpdateUnitDto, @CurrentUser() actor: RequestUser) {
    return this.org.updateUnit(id, dto, actor);
  }

  @Delete("units/:id")
  @Permissions(PermissionCode.OrgStructureManage)
  deleteUnit(@Param("id") id: string, @Query("force") force: string | undefined, @CurrentUser() actor: RequestUser) {
    return this.org.deleteUnit(id, force === "true", actor);
  }

  @Post("sub-units")
  @Permissions(PermissionCode.OrgStructureManage)
  createSubUnit(@Body() dto: CreateSubUnitDto, @CurrentUser() actor: RequestUser) {
    return this.org.createSubUnit(dto, actor);
  }

  @Get("sub-units")
  @Permissions(PermissionCode.OrgRead)
  listSubUnits(@CurrentUser() actor: RequestUser, @Query("unitId") unitId?: string) {
    return this.org.listSubUnits(unitId, actor);
  }

  @Get("sub-units/:id")
  @Permissions(PermissionCode.OrgRead)
  getSubUnit(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.org.getSubUnit(id, actor);
  }

  @Patch("sub-units/:id")
  @Permissions(PermissionCode.OrgStructureManage)
  updateSubUnit(@Param("id") id: string, @Body() dto: UpdateSubUnitDto, @CurrentUser() actor: RequestUser) {
    return this.org.updateSubUnit(id, dto, actor);
  }

  @Delete("sub-units/:id")
  @Permissions(PermissionCode.OrgStructureManage)
  deleteSubUnit(@Param("id") id: string, @Query("force") force: string | undefined, @CurrentUser() actor: RequestUser) {
    return this.org.deleteSubUnit(id, force === "true", actor);
  }

  @Post("groups")
  @Permissions(PermissionCode.OrgManage)
  createGroup(@Body() dto: CreateGroupDto, @CurrentUser() actor: RequestUser) {
    return this.org.createGroup(dto, actor);
  }

  @Get("groups")
  @Permissions(PermissionCode.OrgRead)
  listGroups(@CurrentUser() actor: RequestUser, @Query("subUnitId") subUnitId?: string) {
    return this.org.listGroups(subUnitId, actor);
  }

  @Get("groups/:id")
  @Permissions(PermissionCode.OrgRead)
  getGroup(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.org.getGroup(id, actor);
  }

  @Patch("groups/:id")
  @Permissions(PermissionCode.OrgManage)
  updateGroup(@Param("id") id: string, @Body() dto: UpdateGroupDto, @CurrentUser() actor: RequestUser) {
    return this.org.updateGroup(id, dto, actor);
  }

  @Patch("groups/:id/approve")
  @Permissions(PermissionCode.AttendanceManage)
  approveGroup(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.org.approveGroup(id, actor);
  }

  @Patch("groups/:id/reject")
  @Permissions(PermissionCode.AttendanceManage)
  rejectGroup(@Param("id") id: string, @Body() dto: { reason?: string }, @CurrentUser() actor: RequestUser) {
    return this.org.rejectGroup(id, dto.reason, actor);
  }

  @Delete("groups/:id")
  @Permissions(PermissionCode.OrgManage)
  deleteGroup(@Param("id") id: string, @Query("force") force: string | undefined, @CurrentUser() actor: RequestUser) {
    return this.org.deleteGroup(id, force === "true", actor);
  }

  @Patch("employees/:id/group")
  @Permissions(PermissionCode.OrgManage)
  moveEmployee(@Param("id") id: string, @Body() dto: MoveEmployeeDto, @CurrentUser() actor: RequestUser) {
    return this.org.moveEmployee(id, dto, actor);
  }

  @Patch("membership-changes/:id/approve")
  @Permissions(PermissionCode.AttendanceManage)
  approveMembershipChange(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.org.approveMembershipChange(id, actor);
  }

  @Patch("membership-changes/:id/reject")
  @Permissions(PermissionCode.AttendanceManage)
  rejectMembershipChange(@Param("id") id: string, @Body() dto: { reason?: string }, @CurrentUser() actor: RequestUser) {
    return this.org.rejectMembershipChange(id, dto.reason, actor);
  }

  @Post("employees/bulk-move")
  @Permissions(PermissionCode.OrgManage)
  moveEmployees(@Body() dto: MoveEmployeesDto, @CurrentUser() actor: RequestUser) {
    return this.org.moveEmployees(dto, actor);
  }
}
