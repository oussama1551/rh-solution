import { Body, Controller, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { JobDocumentStatus } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { ArchiveJobDescriptionDto, CreateEmployeeJobDescriptionDto, ReviewJobDescriptionDto, ReviseJobDescriptionDto, UpdateJobDescriptionDraftDto } from "./dto/job-descriptions.dto";
import { JobDescriptionsService } from "./job-descriptions.service";

@Controller("job-descriptions")
export class JobDescriptionsController {
  constructor(private readonly service: JobDescriptionsService) {}

  @Get("employee-source/:employeeId")
  @Permissions(PermissionCode.JobDescriptionCreate)
  employeeSource(@Param("employeeId") employeeId: string, @CurrentUser() actor: RequestUser) {
    return this.service.employeeSource(employeeId, actor);
  }

  @Get("documents")
  @Permissions(PermissionCode.JobDescriptionView)
  list(@CurrentUser() actor: RequestUser, @Query("employeeId") employeeId?: string, @Query("status") status?: JobDocumentStatus, @Query("search") search?: string) {
    return this.service.listDescriptions({ employeeId, status, search }, actor);
  }

  @Get("documents/:id")
  @Permissions(PermissionCode.JobDescriptionView)
  get(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.service.getDescription(id, actor);
  }

  @Post("documents")
  @Permissions(PermissionCode.JobDescriptionCreate)
  create(@Body() dto: CreateEmployeeJobDescriptionDto, @CurrentUser() actor: RequestUser) {
    return this.service.createDescription(dto, actor);
  }

  @Patch("documents/:id/draft")
  @Permissions(PermissionCode.JobDescriptionEdit)
  updateDraft(@Param("id") id: string, @Body() dto: UpdateJobDescriptionDraftDto, @CurrentUser() actor: RequestUser) {
    return this.service.updateDescriptionDraft(id, dto, actor);
  }

  @Post("documents/:id/revise")
  @Permissions(PermissionCode.JobDescriptionEdit)
  revise(@Param("id") id: string, @Body() dto: ReviseJobDescriptionDto, @CurrentUser() actor: RequestUser) {
    return this.service.reviseDescription(id, dto, actor);
  }

  @Post("documents/:id/archive")
  @Permissions(PermissionCode.JobDescriptionArchive)
  archive(@Param("id") id: string, @Body() dto: ArchiveJobDescriptionDto, @CurrentUser() actor: RequestUser) {
    return this.service.archiveDescription(id, dto.reason, actor);
  }

  @Get("documents/:id/compare")
  @Permissions(PermissionCode.JobDescriptionView)
  compare(@Param("id") id: string, @Query("from") from: string, @Query("to") to: string, @CurrentUser() actor: RequestUser) {
    return this.service.compareVersions(id, from, to, actor);
  }

  @Post("documents/:id/submit")
  @Permissions(PermissionCode.JobDescriptionEdit)
  submit(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.service.submitDescription(id, actor);
  }

  @Get("validation-queue")
  @Permissions(PermissionCode.JobDescriptionValidate)
  validationQueue(@CurrentUser() actor: RequestUser) {
    return this.service.validationQueue(actor);
  }

  @Post("approvals/:id/approve")
  @Permissions(PermissionCode.JobDescriptionValidate)
  approve(@Param("id") id: string, @Body() dto: ReviewJobDescriptionDto, @CurrentUser() actor: RequestUser) {
    return this.service.approveDescription(id, dto.comment, actor);
  }

  @Post("approvals/:id/reject")
  @Permissions(PermissionCode.JobDescriptionValidate)
  reject(@Param("id") id: string, @Body() dto: ReviewJobDescriptionDto, @CurrentUser() actor: RequestUser) {
    return this.service.rejectDescription(id, dto.comment, actor);
  }

  @Post("documents/:id/generate-pdf")
  @Permissions(PermissionCode.JobDescriptionGenerate)
  generatePdf(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.service.generatePdf(id, actor);
  }

  @Get("files/:id/download")
  @Permissions(PermissionCode.JobDescriptionView)
  async downloadFile(@Param("id") id: string, @CurrentUser() actor: RequestUser, @Res() response: Response) {
    const { file, buffer } = await this.service.downloadFile(id, actor);
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Disposition", `attachment; filename="${file.originalName.replace(/[\r\n\"]/g, "")}"`);
    response.setHeader("Content-Length", buffer.length);
    response.setHeader("X-Content-SHA256", file.sha256);
    response.end(buffer);
  }

  @Get("workflow-approvers")
  @Permissions(PermissionCode.JobTemplateManage)
  workflowApprovers() {
    return this.service.workflowApprovers();
  }
}
