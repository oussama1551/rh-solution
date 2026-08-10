import { Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { BioTimeEmployeeDto } from "./dto/biotime-employee.dto";
import { ResignEmployeeDto } from "./dto/resign-employee.dto";
import { EmployeesService } from "./employees.service";

@Controller("employees")
@Permissions(PermissionCode.EmployeesRead)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser) {
    return this.employees.list(actor);
  }

  @Get("biotime/departments")
  @Permissions(PermissionCode.EmployeesManage)
  biotimeDepartments() {
    return this.employees.biotimeDepartments();
  }

  @Get("emp-code/exists")
  @Permissions(PermissionCode.EmployeesManage)
  async employeeCodeExists(@Query("code") code?: string) {
    const rows = await this.employees.list();
    const normalized = code?.trim().toLowerCase() || "";
    return { exists: Boolean(normalized && rows.some(row => [row.employeeCode, row.biotimeCode, row.zktecoId].some(value => value?.toLowerCase() === normalized))) };
  }

  @Post()
  @Permissions(PermissionCode.EmployeesManage)
  create(@Body() dto: BioTimeEmployeeDto, @CurrentUser() actor: RequestUser) {
    return this.employees.createInBioTime(dto, actor);
  }

  @Get("resigned")
  listResigned(
    @Query("q") q: string | undefined,
    @Query("department") department: string | undefined,
    @Query("resignType") resignType: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() actor: RequestUser
  ) {
    return this.employees.listResigned({ q, department, resignType, from, to }, actor);
  }

  @Post("resigns/:resignId/reinstate")
  @Permissions(PermissionCode.EmployeesManage)
  reinstate(@Param("resignId") resignId: string, @CurrentUser() actor: RequestUser) {
    return this.employees.reinstateResign(resignId, actor);
  }

  @Get(":id/biotime")
  @Permissions(PermissionCode.EmployeesManage)
  biotimeLive(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.employees.getBiotimeLive(id, actor);
  }

  @Get(":id/punches")
  getPunchHistory(
    @Param("id") id: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("limit") limit: string | undefined,
    @CurrentUser() actor: RequestUser
  ) {
    return this.employees.punchHistory(id, { from, to, limit }, actor);
  }

  @Patch(":id/biotime")
  @Permissions(PermissionCode.EmployeesManage)
  updateBiotime(@Param("id") id: string, @Body() dto: BioTimeEmployeeDto, @CurrentUser() actor: RequestUser) {
    return this.employees.updateInBioTime(id, dto, actor);
  }

  @Post(":id/photo")
  @Permissions(PermissionCode.EmployeesManage)
  @UseInterceptors(FileInterceptor("photo"))
  uploadPhoto(@Param("id") id: string, @UploadedFile() file: any, @CurrentUser() actor: RequestUser) {
    return this.employees.uploadBiotimePhoto(id, file, actor);
  }

  @Post(":id/resign")
  @Permissions(PermissionCode.EmployeesManage)
  resign(@Param("id") id: string, @Body() dto: ResignEmployeeDto, @CurrentUser() actor: RequestUser) {
    return this.employees.resignEmployee(id, dto, actor);
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
