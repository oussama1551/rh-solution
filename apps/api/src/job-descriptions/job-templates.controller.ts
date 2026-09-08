import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { CreateJobPositionDto, CreateMissionDto, CreateTemplateDto, CreateWorkflowDto, OrganizationImportDto, ResolveJobVariablesDto, SetTemplateWorkflowDto, UpdateJobPositionDto, UpdateMissionDto, UpdateTemplateDraftDto } from "./dto/job-descriptions.dto";
import { JobDescriptionsService } from "./job-descriptions.service";
import { JOB_VARIABLES, findJobVariables, resolveJobVariables } from "./job-variable-registry";

@Controller("job-descriptions")
export class JobTemplatesController {
  constructor(private readonly service: JobDescriptionsService) {}

  @Get("positions")
  @Permissions(PermissionCode.JobDescriptionView)
  positions(@Query("companyId") companyId?: string, @Query("search") search?: string, @Query("includeInactive") includeInactive?: string) {
    return this.service.listPositions({ companyId, search, includeInactive: includeInactive === "true" });
  }

  @Post("positions")
  @Permissions(PermissionCode.JobTemplateManage)
  createPosition(@Body() dto: CreateJobPositionDto, @CurrentUser() actor: RequestUser) {
    return this.service.createPosition(dto, actor);
  }

  @Patch("positions/:id")
  @Permissions(PermissionCode.JobTemplateManage)
  updatePosition(@Param("id") id: string, @Body() dto: UpdateJobPositionDto, @CurrentUser() actor: RequestUser) {
    return this.service.updatePosition(id, dto, actor);
  }

  @Get("templates")
  @Permissions(PermissionCode.JobDescriptionView)
  templates(@Query("jobPositionId") jobPositionId?: string, @Query("companyId") companyId?: string, @Query("includeInactive") includeInactive?: string) {
    return this.service.listTemplates({ jobPositionId, companyId, includeInactive: includeInactive === "true" });
  }

  @Post("templates")
  @Permissions(PermissionCode.JobTemplateManage)
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() actor: RequestUser) {
    return this.service.createTemplate(dto, actor);
  }

  @Get("templates/:id")
  @Permissions(PermissionCode.JobDescriptionView)
  getTemplate(@Param("id") id: string) {
    return this.service.getTemplate(id);
  }

  @Patch("templates/:id/draft")
  @Permissions(PermissionCode.JobTemplateManage)
  updateTemplate(@Param("id") id: string, @Body() dto: UpdateTemplateDraftDto, @CurrentUser() actor: RequestUser) {
    return this.service.updateTemplateDraft(id, dto, actor);
  }

  @Post("templates/:id/validate")
  @Permissions(PermissionCode.JobDescriptionValidate)
  validateTemplate(@Param("id") id: string, @CurrentUser() actor: RequestUser) {
    return this.service.validateTemplate(id, actor);
  }

  @Patch("templates/:id/workflow")
  @Permissions(PermissionCode.JobTemplateManage)
  setTemplateWorkflow(@Param("id") id: string, @Body() dto: SetTemplateWorkflowDto, @CurrentUser() actor: RequestUser) {
    return this.service.setTemplateWorkflow(id, dto.workflowId, actor);
  }

  @Get("missions")
  @Permissions(PermissionCode.JobDescriptionView)
  missions(@Query("companyId") companyId?: string, @Query("category") category?: string, @Query("search") search?: string, @Query("includeInactive") includeInactive?: string) {
    return this.service.listMissions({ companyId, category, search, includeInactive: includeInactive === "true" });
  }

  @Post("missions")
  @Permissions(PermissionCode.MissionLibraryManage)
  createMission(@Body() dto: CreateMissionDto, @CurrentUser() actor: RequestUser) {
    return this.service.createMission(dto, actor);
  }

  @Patch("missions/:id")
  @Permissions(PermissionCode.MissionLibraryManage)
  updateMission(@Param("id") id: string, @Body() dto: UpdateMissionDto, @CurrentUser() actor: RequestUser) {
    return this.service.updateMission(id, dto, actor);
  }

  @Get("workflows")
  @Permissions(PermissionCode.JobDescriptionView)
  workflows(@Query("companyId") companyId?: string) {
    return this.service.listWorkflows(companyId);
  }

  @Post("workflows")
  @Permissions(PermissionCode.JobTemplateManage)
  createWorkflow(@Body() dto: CreateWorkflowDto, @CurrentUser() actor: RequestUser) {
    return this.service.createWorkflow(dto, actor);
  }

  @Get("variable-catalog")
  @Permissions(PermissionCode.JobDescriptionView)
  variableCatalog() {
    return JOB_VARIABLES;
  }

  @Post("variables/resolve")
  @Permissions(PermissionCode.JobDescriptionView)
  resolveVariables(@Body() dto: ResolveJobVariablesDto) {
    return { ...resolveJobVariables(dto.content, dto.context, dto.useSamples), usedVariables: findJobVariables(dto.content) };
  }

  @Post("organization-import/preview")
  @Permissions(PermissionCode.JobTemplateManage)
  previewOrganizationImport(@Body() dto: OrganizationImportDto) {
    return this.service.previewOrganizationImport(dto);
  }

  @Post("organization-import/commit")
  @Permissions(PermissionCode.JobTemplateManage)
  importOrganization(@Body() dto: OrganizationImportDto, @CurrentUser() actor: RequestUser) {
    return this.service.importOrganization(dto, actor);
  }
}
