import { Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { CreateCompanyDto, UpdateCompanyDto } from "./dto/job-descriptions.dto";
import { JobDescriptionsService } from "./job-descriptions.service";

@Controller("job-descriptions/companies")
export class JobCompaniesController {
  constructor(private readonly service: JobDescriptionsService) {}

  @Get()
  @Permissions(PermissionCode.JobDescriptionView)
  list(@Query("includeInactive") includeInactive?: string) {
    return this.service.listCompanies(includeInactive === "true");
  }

  @Post()
  @Permissions(PermissionCode.CompanyBrandingManage)
  create(@Body() dto: CreateCompanyDto, @CurrentUser() actor: RequestUser) {
    return this.service.createCompany(dto, actor);
  }

  @Patch(":id")
  @Permissions(PermissionCode.CompanyBrandingManage)
  update(@Param("id") id: string, @Body() dto: UpdateCompanyDto, @CurrentUser() actor: RequestUser) {
    return this.service.updateCompany(id, dto, actor);
  }

  @Post(":id/logo")
  @Permissions(PermissionCode.CompanyBrandingManage)
  @UseInterceptors(FileInterceptor("logo", { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  uploadLogo(@Param("id") id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string }, @CurrentUser() actor: RequestUser) {
    return this.service.uploadCompanyLogo(id, file, actor);
  }

  @Get(":id/logo")
  @Permissions(PermissionCode.JobDescriptionView)
  async logo(@Param("id") id: string, @Res() response: Response) {
    const logo = await this.service.companyLogo(id);
    response.setHeader("Content-Type", "image/png");
    response.setHeader("Content-Length", logo.length);
    response.setHeader("Cache-Control", "private, max-age=300");
    response.end(logo);
  }
}
