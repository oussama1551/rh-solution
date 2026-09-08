import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { JobApprovalStatus, JobApproverType, JobDocumentStatus, NotificationType, Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import { resolve, sep } from "path";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../common/request-user.type";
import { employeeScopeWhere } from "../common/employee-scope";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  CreateCompanyDto,
  CreateEmployeeJobDescriptionDto,
  CreateJobPositionDto,
  CreateMissionDto,
  CreateTemplateDto,
  CreateWorkflowDto,
  OrganizationImportDto,
  ReviseJobDescriptionDto,
  UpdateCompanyDto,
  UpdateJobDescriptionDraftDto,
  UpdateJobPositionDto,
  UpdateMissionDto,
  UpdateTemplateDraftDto
} from "./dto/job-descriptions.dto";
import { emptyBuilderDocument } from "./job-description.types";
import { JobDescriptionPdfService } from "./job-description-pdf.service";

@Injectable()
export class JobDescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly pdf: JobDescriptionPdfService
  ) {}

  listCompanies(includeInactive = false) {
    return this.prisma.company.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { brandings: { where: { isActive: true }, orderBy: { createdAt: "desc" } } },
      orderBy: { code: "asc" }
    });
  }

  async createCompany(dto: CreateCompanyDto, actor: RequestUser) {
    const company = await this.prisma.company.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        officialName: dto.officialName.trim(),
        shortName: dto.shortName.trim(),
        address: optionalText(dto.address),
        phone: optionalText(dto.phone),
        email: optionalText(dto.email)?.toLowerCase(),
        legalInfo: optionalText(dto.legalInfo),
        primaryColor: optionalText(dto.primaryColor),
        footerText: optionalText(dto.footerText),
        referenceSettings: {
          create: {
            documentType: "FP",
            pattern: "{{doc_type}}-{{company_code}}-{{department_code}}-{{job_code}}-{{sequence}}"
          }
        }
      }
    });
    await this.audit.record({ userId: actor.id, action: "job_company.create", entityType: "company", entityId: company.id, after: company as unknown as Prisma.InputJsonValue });
    return company;
  }

  async updateCompany(id: string, dto: UpdateCompanyDto, actor: RequestUser) {
    const before = await this.prisma.company.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Société introuvable.");
    const company = await this.prisma.company.update({
      where: { id },
      data: {
        officialName: dto.officialName?.trim(), shortName: dto.shortName?.trim(),
        address: optionalUpdate(dto.address), phone: optionalUpdate(dto.phone),
        email: dto.email === undefined ? undefined : optionalText(dto.email)?.toLowerCase() || null,
        legalInfo: optionalUpdate(dto.legalInfo), primaryColor: optionalUpdate(dto.primaryColor),
        footerText: optionalUpdate(dto.footerText), isActive: dto.isActive
      }
    });
    await this.audit.record({ userId: actor.id, action: "job_company.update", entityType: "company", entityId: id, before: before as unknown as Prisma.InputJsonValue, after: company as unknown as Prisma.InputJsonValue });
    return company;
  }

  async uploadCompanyLogo(companyId: string, file: { buffer: Buffer; mimetype: string; originalname: string } | undefined, actor: RequestUser) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException("Société introuvable.");
    if (!file?.buffer?.length) throw new BadRequestException("Sélectionnez un fichier PNG.");
    if (file.mimetype !== "image/png" || !isPng(file.buffer)) throw new BadRequestException("Le logo doit être un véritable fichier PNG.");
    if (file.buffer.length > 2 * 1024 * 1024) throw new BadRequestException("Le logo PNG ne doit pas dépasser 2 Mo.");
    const hash = createHash("sha256").update(file.buffer).digest("hex");
    const relativePath = `branding/${companyId}/${hash}.png`;
    const absolutePath = this.safeStoragePath(relativePath);
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, file.buffer, { flag: "wx" }).catch(async error => { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; });
    try {
      const branding = await this.prisma.$transaction(async tx => {
        await tx.companyBranding.updateMany({ where: { companyId, assetType: "LOGO", isActive: true }, data: { isActive: false } });
        return tx.companyBranding.create({ data: { companyId, assetType: "LOGO", relativePath, originalName: safeFilename(file.originalname || `${company.code}.png`), mimeType: "image/png", sizeBytes: file.buffer.length, sha256: hash } });
      });
      await this.audit.record({ userId: actor.id, action: "job_company.logo.update", entityType: "company_branding", entityId: branding.id, metadata: { companyId, sha256: hash, sizeBytes: file.buffer.length } });
      return branding;
    } catch (error) { throw error; }
  }

  async companyLogo(companyId: string) {
    const branding = await this.prisma.companyBranding.findFirst({ where: { companyId, assetType: "LOGO", isActive: true }, orderBy: { createdAt: "desc" } });
    if (!branding) throw new NotFoundException("Logo PNG non configuré.");
    const buffer = await readFile(this.safeStoragePath(branding.relativePath)).catch(() => { throw new NotFoundException("Le fichier du logo est absent du stockage serveur."); });
    if (!isPng(buffer) || createHash("sha256").update(buffer).digest("hex") !== branding.sha256) throw new BadRequestException("L'intégrité du logo PNG ne peut pas être garantie.");
    return buffer;
  }

  listPositions(filters: { companyId?: string; search?: string; includeInactive?: boolean }) {
    const search = filters.search?.trim();
    return this.prisma.jobPosition.findMany({
      where: {
        isActive: filters.includeInactive ? undefined : true,
        OR: filters.companyId ? [{ companyId: filters.companyId }, { companyId: null }] : undefined,
        AND: search ? [{ OR: [{ code: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { aliases: { some: { sourceValue: { contains: search, mode: "insensitive" } } } }] }] : undefined
      },
      include: { company: { include: { brandings: { where: { isActive: true }, orderBy: { createdAt: "desc" } } } }, aliases: true, templates: { where: { isActive: true }, include: { currentVersion: true } } },
      orderBy: [{ title: "asc" }]
    });
  }

  async createPosition(dto: CreateJobPositionDto, actor: RequestUser) {
    const position = await this.prisma.jobPosition.create({
      data: {
        companyId: dto.companyId || null, code: dto.code.trim().toUpperCase(), title: dto.title.trim(),
        direction: optionalText(dto.direction), department: optionalText(dto.department), service: optionalText(dto.service),
        hierarchicalReporting: optionalText(dto.hierarchicalReporting), functionalReporting: optionalText(dto.functionalReporting),
        createdById: actor.id,
        aliases: { create: uniqueAliases(dto.aliases).map(sourceValue => ({ companyId: dto.companyId || null, sourceValue, normalizedValue: normalizeText(sourceValue) })) }
      },
      include: { company: true, aliases: true }
    });
    await this.audit.record({ userId: actor.id, action: "job_position.create", entityType: "job_position", entityId: position.id, after: position as unknown as Prisma.InputJsonValue });
    return position;
  }

  async updatePosition(id: string, dto: UpdateJobPositionDto, actor: RequestUser) {
    const before = await this.prisma.jobPosition.findUnique({ where: { id }, include: { aliases: true } });
    if (!before) throw new NotFoundException("Poste introuvable.");
    const position = await this.prisma.$transaction(async tx => {
      if (dto.aliases) {
        await tx.jobPositionAlias.deleteMany({ where: { jobPositionId: id } });
        const aliases = uniqueAliases(dto.aliases);
        if (aliases.length) await tx.jobPositionAlias.createMany({ data: aliases.map(sourceValue => ({ jobPositionId: id, companyId: before.companyId, sourceValue, normalizedValue: normalizeText(sourceValue) })) });
      }
      return tx.jobPosition.update({
        where: { id },
        data: {
          title: dto.title?.trim(), direction: optionalUpdate(dto.direction), department: optionalUpdate(dto.department),
          service: optionalUpdate(dto.service), hierarchicalReporting: optionalUpdate(dto.hierarchicalReporting),
          functionalReporting: optionalUpdate(dto.functionalReporting), isActive: dto.isActive
        },
        include: { company: true, aliases: true }
      });
    });
    await this.audit.record({ userId: actor.id, action: "job_position.update", entityType: "job_position", entityId: id, before: before as unknown as Prisma.InputJsonValue, after: position as unknown as Prisma.InputJsonValue });
    return position;
  }

  listTemplates(filters: { jobPositionId?: string; companyId?: string; includeInactive?: boolean }) {
    return this.prisma.jobDescriptionTemplate.findMany({
      where: {
        jobPositionId: filters.jobPositionId,
        isActive: filters.includeInactive ? undefined : true,
        OR: filters.companyId ? [{ companyId: filters.companyId }, { companyId: null }] : undefined
      },
      include: { jobPosition: true, company: true, currentVersion: true, versions: { orderBy: [{ majorVersion: "desc" }, { minorVersion: "desc" }] } },
      orderBy: { name: "asc" }
    });
  }

  async getTemplate(id: string) {
    const template = await this.prisma.jobDescriptionTemplate.findUnique({
      where: { id },
      include: {
        jobPosition: { include: { company: { include: { brandings: { where: { isActive: true }, orderBy: { createdAt: "desc" } } } }, aliases: true } },
        company: true,
        workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
        currentVersion: true,
        versions: { orderBy: [{ majorVersion: "desc" }, { minorVersion: "desc" }] }
      }
    });
    if (!template) throw new NotFoundException("Template introuvable.");
    return template;
  }

  async createTemplate(dto: CreateTemplateDto, actor: RequestUser) {
    validateBuilderContent(dto.content);
    const hash = contentHash(dto.content);
    const template = await this.prisma.$transaction(async tx => {
      const created = await tx.jobDescriptionTemplate.create({
        data: {
          jobPositionId: dto.jobPositionId, companyId: dto.companyId || null, workflowId: dto.workflowId || null,
          name: dto.name.trim(), visualTheme: dto.visualTheme || "corporate", orientation: dto.orientation || "portrait", createdById: actor.id
        }
      });
      const version = await tx.jobTemplateVersion.create({
        data: {
          templateId: created.id, content: dto.content as Prisma.InputJsonValue,
          validationRules: dto.validationRules as Prisma.InputJsonValue | undefined,
          contentHash: hash, authorId: actor.id
        }
      });
      return tx.jobDescriptionTemplate.update({ where: { id: created.id }, data: { currentVersionId: version.id }, include: { currentVersion: true, jobPosition: true, company: true } });
    });
    await this.audit.record({ userId: actor.id, action: "job_template.create", entityType: "job_description_template", entityId: template.id, metadata: { version: "1.0", contentHash: hash } });
    return template;
  }

  async updateTemplateDraft(templateId: string, dto: UpdateTemplateDraftDto, actor: RequestUser) {
    validateBuilderContent(dto.content);
    const template = await this.prisma.jobDescriptionTemplate.findUnique({ where: { id: templateId }, include: { currentVersion: true } });
    if (!template?.currentVersion) throw new NotFoundException("Template introuvable.");
    if (template.currentVersion.status !== JobDocumentStatus.DRAFT) throw new BadRequestException("Une version validée ne peut pas être écrasée. Créez une révision.");
    const before = template.currentVersion;
    const version = await this.prisma.jobTemplateVersion.update({
      where: { id: before.id },
      data: { content: dto.content as Prisma.InputJsonValue, validationRules: dto.validationRules as Prisma.InputJsonValue | undefined, revisionReason: optionalText(dto.revisionReason), contentHash: contentHash(dto.content) }
    });
    await this.audit.record({ userId: actor.id, action: "job_template.draft.update", entityType: "job_template_version", entityId: version.id, before: { contentHash: before.contentHash }, after: { contentHash: version.contentHash } });
    return version;
  }

  async validateTemplate(templateId: string, actor: RequestUser) {
    const template = await this.prisma.jobDescriptionTemplate.findUnique({ where: { id: templateId }, include: { currentVersion: true } });
    if (!template?.currentVersion) throw new NotFoundException("Template introuvable.");
    if (template.currentVersion.status !== JobDocumentStatus.DRAFT && template.currentVersion.status !== JobDocumentStatus.PENDING_APPROVAL) throw new BadRequestException("Cette version ne peut pas être validée.");
    const version = await this.prisma.jobTemplateVersion.update({ where: { id: template.currentVersion.id }, data: { status: JobDocumentStatus.VALIDATED, validatedById: actor.id, validatedAt: new Date() } });
    await this.audit.record({ userId: actor.id, action: "job_template.validate", entityType: "job_template_version", entityId: version.id, metadata: { templateId } });
    return version;
  }

  async setTemplateWorkflow(templateId: string, workflowId: string | undefined, actor: RequestUser) {
    const before = await this.prisma.jobDescriptionTemplate.findUnique({ where: { id: templateId } });
    if (!before) throw new NotFoundException("Template introuvable.");
    if (workflowId) {
      const workflow = await this.prisma.jobApprovalWorkflow.findUnique({ where: { id: workflowId } });
      if (!workflow?.isActive) throw new BadRequestException("Circuit de validation introuvable ou inactif.");
    }
    const template = await this.prisma.jobDescriptionTemplate.update({ where: { id: templateId }, data: { workflowId: workflowId || null }, include: { workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } } } });
    await this.audit.record({ userId: actor.id, action: "job_template.workflow.update", entityType: "job_description_template", entityId: templateId, before: { workflowId: before.workflowId }, after: { workflowId: template.workflowId } });
    return template;
  }

  listMissions(filters: { companyId?: string; category?: string; search?: string; includeInactive?: boolean }) {
    const search = filters.search?.trim();
    return this.prisma.missionLibraryItem.findMany({
      where: {
        isActive: filters.includeInactive ? undefined : true,
        OR: filters.companyId ? [{ companyId: filters.companyId }, { companyId: null }] : undefined,
        category: filters.category ? { equals: filters.category, mode: "insensitive" } : undefined,
        AND: search ? [{ OR: [{ label: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }] }] : undefined
      },
      include: { company: true }, orderBy: [{ category: "asc" }, { label: "asc" }]
    });
  }

  async createMission(dto: CreateMissionDto, actor: RequestUser) {
    const item = await this.prisma.missionLibraryItem.create({ data: missionData(dto, actor.id), include: { company: true } });
    await this.audit.record({ userId: actor.id, action: "job_mission.create", entityType: "mission_library_item", entityId: item.id, after: item as unknown as Prisma.InputJsonValue });
    return item;
  }

  async updateMission(id: string, dto: UpdateMissionDto, actor: RequestUser) {
    const before = await this.prisma.missionLibraryItem.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Mission introuvable.");
    const item = await this.prisma.missionLibraryItem.update({ where: { id }, data: { ...missionData(dto, before.createdById), isActive: dto.isActive }, include: { company: true } });
    await this.audit.record({ userId: actor.id, action: "job_mission.update", entityType: "mission_library_item", entityId: id, before: before as unknown as Prisma.InputJsonValue, after: item as unknown as Prisma.InputJsonValue });
    return item;
  }

  listWorkflows(companyId?: string) {
    return this.prisma.jobApprovalWorkflow.findMany({ where: { isActive: true, OR: companyId ? [{ companyId }, { companyId: null }] : undefined }, include: { company: true, steps: { orderBy: { stepOrder: "asc" } } }, orderBy: { name: "asc" } });
  }

  async createWorkflow(dto: CreateWorkflowDto, actor: RequestUser) {
    if (!dto.steps.length) throw new BadRequestException("Le workflow doit contenir au moins une étape.");
    if (new Set(dto.steps.map(step => step.stepOrder)).size !== dto.steps.length) throw new BadRequestException("Les ordres des étapes doivent être uniques.");
    const invalidStep = dto.steps.find(step => ["USER", "MANAGER"].includes(step.approverType) && !step.approverUserId || step.approverType === "ROLE" && !step.approverRoleCode || step.approverType === "EMPLOYEE");
    if (invalidStep) throw new BadRequestException("Chaque étape doit cibler un utilisateur ou un rôle. La validation Employé sera activée avec le futur portail salarié.");
    const workflow = await this.prisma.jobApprovalWorkflow.create({
      data: {
        companyId: dto.companyId || null, name: dto.name.trim(), createdById: actor.id,
        steps: { create: dto.steps.map(step => ({ ...step, approverUserId: step.approverUserId || null, approverRoleCode: optionalText(step.approverRoleCode), signatureRequired: step.signatureRequired || false, stampRequired: step.stampRequired || false })) }
      }, include: { steps: { orderBy: { stepOrder: "asc" } } }
    });
    await this.audit.record({ userId: actor.id, action: "job_workflow.create", entityType: "job_approval_workflow", entityId: workflow.id, after: workflow as unknown as Prisma.InputJsonValue });
    return workflow;
  }

  async employeeSource(employeeId: string, actor?: RequestUser) {
    const employee = await this.loadEmployeeSource(employeeId, actor);
    return this.employeeSourcePayload(employee);
  }

  listDescriptions(filters: { employeeId?: string; status?: JobDocumentStatus; search?: string }, actor?: RequestUser) {
    const search = filters.search?.trim();
    return this.prisma.employeeJobDescription.findMany({
      where: {
        employeeId: filters.employeeId, status: filters.status, employee: employeeScopeWhere(actor),
        OR: search ? [{ reference: { contains: search, mode: "insensitive" } }, { employee: { fullName: { contains: search, mode: "insensitive" } } }] : undefined
      },
      include: { employee: true, company: true, jobPosition: true, currentVersion: true },
      orderBy: { updatedAt: "desc" }
    });
  }

  getDescription(id: string, actor?: RequestUser) {
    return this.prisma.employeeJobDescription.findFirst({
      where: { id, employee: employeeScopeWhere(actor) }, include: { employee: true, company: { include: { brandings: { where: { isActive: true }, orderBy: { createdAt: "desc" } } } }, jobPosition: true, currentVersion: { include: { approvals: { include: { workflowStep: true, reviewedBy: true } }, files: { include: { generatedBy: { select: { id: true, fullName: true, username: true } } }, orderBy: { generatedAt: "desc" } } } }, versions: { include: { files: true }, orderBy: [{ majorVersion: "desc" }, { minorVersion: "desc" }] } }
    }).then(row => row || Promise.reject(new NotFoundException("Fiche de poste introuvable.")));
  }

  async createDescription(dto: CreateEmployeeJobDescriptionDto, actor: RequestUser) {
    const [employee, company, position, template] = await Promise.all([
      this.loadEmployeeSource(dto.employeeId, actor),
      this.prisma.company.findUnique({ where: { id: dto.companyId }, include: { brandings: { where: { isActive: true } } } }),
      dto.jobPositionId ? this.prisma.jobPosition.findUnique({ where: { id: dto.jobPositionId } }) : null,
      dto.templateId ? this.prisma.jobDescriptionTemplate.findUnique({ where: { id: dto.templateId }, include: { currentVersion: true } }) : null
    ]);
    if (!company?.isActive) throw new BadRequestException("Société inactive ou introuvable.");
    if (dto.jobPositionId && !position) throw new NotFoundException("Poste introuvable.");
    if (dto.templateId && !template?.currentVersion) throw new NotFoundException("Template introuvable.");
    const sap = employee.sapDirectoryRecords[0] || null;
    const selectedTitle = optionalText(dto.selectedJobTitle) || position?.title || sap?.poste;
    if (!selectedTitle) throw new BadRequestException("Le poste SAP est absent : saisissez le poste retenu pour cette fiche.");
    const source = this.employeeSourcePayload(employee);
    const content = template?.currentVersion?.content || emptyBuilderDocument(template?.visualTheme, template?.orientation);
    validateBuilderContent(content as Record<string, unknown>);
    const reference = await this.nextReference(company.id, company.code, position?.department || employee.department || "GEN", position?.code || codeFromTitle(selectedTitle));
    const effectiveDate = dto.effectiveDate ? new Date(`${dto.effectiveDate}T00:00:00.000Z`) : null;
    const employeeSnapshot = { ...source.employee, organization: source.organization, manager: { fullName: optionalText(dto.managerName), jobTitle: optionalText(dto.managerJobTitle) }, capturedAt: new Date().toISOString() };
    const companySnapshot = { id: company.id, code: company.code, officialName: company.officialName, shortName: company.shortName, address: company.address, phone: company.phone, email: company.email, legalInfo: company.legalInfo, primaryColor: company.primaryColor, footerText: company.footerText, branding: company.brandings[0] || null, capturedAt: new Date().toISOString() };
    const jobSnapshot = { source: { kind: "SAP_DIRECTORY", sapDirectoryId: sap?.id || null, sapJobTitle: sap?.poste || null, sapStructure: sap?.structure || null, capturedAt: new Date().toISOString() }, selected: { jobPositionId: position?.id || null, jobCode: position?.code || null, jobTitle: selectedTitle, manuallyEdited: Boolean(dto.selectedJobTitle && dto.selectedJobTitle.trim() !== (sap?.poste || "").trim()) } };
    const result = await this.prisma.$transaction(async tx => {
      const description = await tx.employeeJobDescription.create({ data: { employeeId: employee.id, companyId: company.id, jobPositionId: position?.id || null, reference, effectiveDate, createdById: actor.id } });
      const version = await tx.jobDescriptionVersion.create({ data: { descriptionId: description.id, templateVersionId: template?.currentVersion?.id || null, workflowId: template?.workflowId || null, employeeSnapshot: employeeSnapshot as Prisma.InputJsonValue, companySnapshot: companySnapshot as Prisma.InputJsonValue, jobSnapshot: jobSnapshot as Prisma.InputJsonValue, content: content as Prisma.InputJsonValue, effectiveDate, contentHash: contentHash({ employeeSnapshot, companySnapshot, jobSnapshot, content }), authorId: actor.id } });
      return tx.employeeJobDescription.update({ where: { id: description.id }, data: { currentVersionId: version.id }, include: { employee: true, company: true, jobPosition: true, currentVersion: true } });
    });
    await this.audit.record({ userId: actor.id, action: "job_description.create", entityType: "employee_job_description", entityId: result.id, metadata: { employeeId: employee.id, reference, templateId: template?.id || null, sapJobTitle: sap?.poste || null, selectedJobTitle: selectedTitle } });
    return result;
  }

  async updateDescriptionDraft(id: string, dto: UpdateJobDescriptionDraftDto, actor: RequestUser) {
    validateBuilderContent(dto.content);
    const description = await this.prisma.employeeJobDescription.findFirst({ where: { id, employee: employeeScopeWhere(actor) }, include: { currentVersion: true } });
    if (!description?.currentVersion) throw new NotFoundException("Fiche de poste introuvable.");
    if (description.currentVersion.status !== JobDocumentStatus.DRAFT) throw new BadRequestException("Une version finalisée ne peut pas être écrasée. Créez une révision.");
    const jobSnapshot = description.currentVersion.jobSnapshot as Record<string, any>;
    const employeeSnapshot = description.currentVersion.employeeSnapshot as Record<string, any>;
    if (dto.selectedJobTitle !== undefined) {
      const title = dto.selectedJobTitle.trim();
      if (!title) throw new BadRequestException("L'intitulé du poste est obligatoire.");
      jobSnapshot.selected = { ...(jobSnapshot.selected || {}), jobTitle: title, manuallyEdited: title !== (jobSnapshot.source?.sapJobTitle || "") };
    }
    if (dto.managerName !== undefined || dto.managerJobTitle !== undefined) employeeSnapshot.manager = { ...(employeeSnapshot.manager || {}), fullName: dto.managerName === undefined ? employeeSnapshot.manager?.fullName : optionalText(dto.managerName), jobTitle: dto.managerJobTitle === undefined ? employeeSnapshot.manager?.jobTitle : optionalText(dto.managerJobTitle) };
    const effectiveDate = dto.effectiveDate ? new Date(`${dto.effectiveDate}T00:00:00.000Z`) : undefined;
    const version = await this.prisma.jobDescriptionVersion.update({ where: { id: description.currentVersion.id }, data: { content: dto.content as Prisma.InputJsonValue, jobSnapshot: jobSnapshot as Prisma.InputJsonValue, employeeSnapshot: employeeSnapshot as Prisma.InputJsonValue, effectiveDate, contentHash: contentHash({ employeeSnapshot, companySnapshot: description.currentVersion.companySnapshot, jobSnapshot, content: dto.content }) } });
    if (effectiveDate) await this.prisma.employeeJobDescription.update({ where: { id }, data: { effectiveDate } });
    await this.audit.record({ userId: actor.id, action: "job_description.draft.update", entityType: "job_description_version", entityId: version.id, before: { contentHash: description.currentVersion.contentHash }, after: { contentHash: version.contentHash } });
    return version;
  }

  async submitDescription(id: string, actor: RequestUser) {
    const description = await this.prisma.employeeJobDescription.findFirst({
      where: { id, employee: employeeScopeWhere(actor) },
      include: { employee: true, currentVersion: true }
    });
    if (!description?.currentVersion) throw new NotFoundException("Fiche de poste introuvable.");
    if (description.currentVersion.status !== JobDocumentStatus.DRAFT) throw new BadRequestException("Seul un brouillon peut être soumis.");
    if (!description.currentVersion.workflowId) throw new BadRequestException("Aucun circuit de validation n'est associé à cette fiche.");
    const workflow = await this.prisma.jobApprovalWorkflow.findUnique({ where: { id: description.currentVersion.workflowId }, include: { steps: { orderBy: { stepOrder: "asc" } } } });
    if (!workflow?.isActive || !workflow.steps.length) throw new BadRequestException("Le circuit de validation est absent ou inactif.");
    this.validateRequiredBlocks(description.currentVersion.content);
    await this.prisma.$transaction(async tx => {
      await tx.jobDescriptionApproval.deleteMany({ where: { versionId: description.currentVersion!.id } });
      await tx.jobDescriptionApproval.createMany({ data: workflow.steps.map(step => ({ versionId: description.currentVersion!.id, workflowStepId: step.id, status: JobApprovalStatus.PENDING })) });
      await tx.jobDescriptionVersion.update({ where: { id: description.currentVersion!.id }, data: { status: JobDocumentStatus.PENDING_APPROVAL } });
      await tx.employeeJobDescription.update({ where: { id }, data: { status: JobDocumentStatus.PENDING_APPROVAL } });
    });
    const recipients = await this.approverUserIds(workflow.steps[0]);
    await this.notifications.notify(recipients, NotificationType.PENDING_APPROVAL, { title: "Fiche de poste à valider", message: `${description.employee.fullName} — ${description.reference} — Étape: ${workflow.steps[0].label}`, entityType: "employee_job_description", entityId: description.id });
    await this.audit.record({ userId: actor.id, action: "job_description.submit", entityType: "employee_job_description", entityId: id, metadata: { versionId: description.currentVersion.id, workflowId: workflow.id, steps: workflow.steps.length } });
    return this.getDescription(id);
  }

  async validationQueue(actor: RequestUser) {
    const rows = await this.prisma.jobDescriptionApproval.findMany({
      where: { status: JobApprovalStatus.PENDING, version: { status: JobDocumentStatus.PENDING_APPROVAL, description: { employee: employeeScopeWhere(actor) } } },
      include: {
        workflowStep: true,
        version: { include: { description: { include: { employee: true, company: true, jobPosition: true, createdBy: { select: { id: true, fullName: true, username: true } } } }, approvals: { include: { workflowStep: true }, orderBy: { workflowStep: { stepOrder: "asc" } } } } }
      },
      orderBy: { createdAt: "asc" }
    });
    return rows.filter(row => this.isCurrentApproval(row, row.version.approvals) && this.canReviewStep(row.workflowStep, actor));
  }

  async approveDescription(approvalId: string, comment: string | undefined, actor: RequestUser) {
    const approval = await this.loadApproval(approvalId, actor);
    this.assertReviewAllowed(approval, actor);
    const ordered = approval.version.approvals;
    const currentIndex = ordered.findIndex(row => row.id === approval.id);
    const next = ordered.slice(currentIndex + 1).find(row => row.status === JobApprovalStatus.PENDING);
    await this.prisma.$transaction(async tx => {
      await tx.jobDescriptionApproval.update({ where: { id: approval.id }, data: { status: JobApprovalStatus.APPROVED, reviewedById: actor.id, reviewedAt: new Date(), comment: optionalText(comment) } });
      if (!next) {
        await tx.jobDescriptionVersion.update({ where: { id: approval.versionId }, data: { status: JobDocumentStatus.VALIDATED, finalizedById: actor.id, finalizedAt: new Date() } });
        await tx.employeeJobDescription.update({ where: { id: approval.version.descriptionId }, data: { status: JobDocumentStatus.VALIDATED } });
      }
    });
    if (next) {
      const recipients = await this.approverUserIds(next.workflowStep);
      await this.notifications.notify(recipients, NotificationType.PENDING_APPROVAL, { title: "Fiche de poste à valider", message: `${approval.version.description.employee.fullName} — Étape: ${next.workflowStep.label}`, entityType: "employee_job_description", entityId: approval.version.descriptionId });
    } else {
      await this.notifications.notify([approval.version.description.createdById], NotificationType.APPROVAL_RESULT, { title: "Fiche de poste validée", message: `${approval.version.description.employee.fullName} — ${approval.version.description.reference}`, entityType: "employee_job_description", entityId: approval.version.descriptionId });
    }
    await this.audit.record({ userId: actor.id, action: "job_description.approve", entityType: "job_description_approval", entityId: approval.id, metadata: { descriptionId: approval.version.descriptionId, step: approval.workflowStep.label, final: !next, comment: optionalText(comment) } });
    return this.getDescription(approval.version.descriptionId);
  }

  async rejectDescription(approvalId: string, comment: string | undefined, actor: RequestUser) {
    const approval = await this.loadApproval(approvalId, actor);
    this.assertReviewAllowed(approval, actor);
    if (!optionalText(comment)) throw new BadRequestException("Le motif du refus est obligatoire.");
    await this.prisma.$transaction(async tx => {
      await tx.jobDescriptionApproval.update({ where: { id: approval.id }, data: { status: JobApprovalStatus.REJECTED, reviewedById: actor.id, reviewedAt: new Date(), comment: comment!.trim() } });
      await tx.jobDescriptionApproval.updateMany({ where: { versionId: approval.versionId, id: { not: approval.id }, status: JobApprovalStatus.PENDING }, data: { status: JobApprovalStatus.CANCELLED } });
      await tx.jobDescriptionVersion.update({ where: { id: approval.versionId }, data: { status: JobDocumentStatus.REJECTED } });
      await tx.employeeJobDescription.update({ where: { id: approval.version.descriptionId }, data: { status: JobDocumentStatus.REJECTED } });
    });
    await this.notifications.notify([approval.version.description.createdById], NotificationType.APPROVAL_RESULT, { title: "Fiche de poste refusée", message: `${approval.version.description.employee.fullName} — ${comment!.trim()}`, entityType: "employee_job_description", entityId: approval.version.descriptionId });
    await this.audit.record({ userId: actor.id, action: "job_description.reject", entityType: "job_description_approval", entityId: approval.id, metadata: { descriptionId: approval.version.descriptionId, step: approval.workflowStep.label, comment: comment!.trim() } });
    return this.getDescription(approval.version.descriptionId);
  }

  async generatePdf(id: string, actor: RequestUser) {
    const description = await this.prisma.employeeJobDescription.findFirst({
      where: { id, employee: employeeScopeWhere(actor) },
      include: { currentVersion: { include: { files: true, approvals: { include: { workflowStep: true, reviewedBy: { select: { fullName: true } } }, orderBy: { workflowStep: { stepOrder: "asc" } } } } } }
    });
    const version = description?.currentVersion;
    if (!description || !version) throw new NotFoundException("Fiche de poste introuvable.");
    if (version.status !== JobDocumentStatus.VALIDATED) throw new BadRequestException("La fiche doit être entièrement validée avant la génération du PDF officiel.");
    const existing = version.files.find(file => file.fileType === "PDF");
    if (existing) return existing;
    const buffer = await this.pdf.render({ ...version, reference: description.reference, effectiveDate: version.effectiveDate || description.effectiveDate });
    const hash = createHash("sha256").update(buffer).digest("hex");
    const relativePath = `${description.companyId}/${version.id}/${hash}.pdf`;
    const absolutePath = this.safeStoragePath(relativePath);
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
    try {
      await writeFile(temporaryPath, buffer, { flag: "wx" });
      await rename(temporaryPath, absolutePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    const originalName = `${safeFilename(description.reference)}-V${version.majorVersion}.${version.minorVersion}.pdf`;
    try {
      const file = await this.prisma.jobDescriptionFile.create({ data: { versionId: version.id, fileType: "PDF", relativePath, mimeType: "application/pdf", sizeBytes: buffer.length, sha256: hash, originalName, generatedById: actor.id } });
      await this.audit.record({ userId: actor.id, action: "job_description.pdf.generate", entityType: "job_description_file", entityId: file.id, metadata: { descriptionId: id, versionId: version.id, sha256: hash, sizeBytes: buffer.length } });
      return file;
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      const concurrent = await this.prisma.jobDescriptionFile.findUnique({ where: { versionId_fileType: { versionId: version.id, fileType: "PDF" } } });
      if (concurrent) return concurrent;
      throw error;
    }
  }

  async downloadFile(fileId: string, actor: RequestUser) {
    const file = await this.prisma.jobDescriptionFile.findFirst({ where: { id: fileId, version: { description: { employee: employeeScopeWhere(actor) } } }, include: { version: { select: { descriptionId: true } } } });
    if (!file) throw new NotFoundException("Archive PDF introuvable.");
    const buffer = await readFile(this.safeStoragePath(file.relativePath)).catch(() => { throw new NotFoundException("Le fichier archivé est absent du stockage serveur."); });
    const actualHash = createHash("sha256").update(buffer).digest("hex");
    if (actualHash !== file.sha256 || buffer.length !== file.sizeBytes) throw new BadRequestException("L'intégrité de l'archive PDF ne peut pas être garantie.");
    await this.audit.record({ userId: actor.id, action: "job_description.pdf.download", entityType: "job_description_file", entityId: file.id, metadata: { descriptionId: file.version.descriptionId, sha256: file.sha256 } });
    return { file, buffer };
  }

  async reviseDescription(id: string, dto: ReviseJobDescriptionDto, actor: RequestUser) {
    const description = await this.prisma.employeeJobDescription.findFirst({ where: { id, employee: employeeScopeWhere(actor) }, include: { currentVersion: true } });
    const current = description?.currentVersion;
    if (!description || !current) throw new NotFoundException("Fiche de poste introuvable.");
    if (current.status !== JobDocumentStatus.VALIDATED) throw new BadRequestException("Seule une version validée peut être révisée.");
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException("Le motif de révision est obligatoire.");
    const majorVersion = dto.bump === "MAJOR" ? current.majorVersion + 1 : current.majorVersion;
    const minorVersion = dto.bump === "MAJOR" ? 0 : current.minorVersion + 1;
    const version = await this.prisma.$transaction(async tx => {
      const created = await tx.jobDescriptionVersion.create({ data: {
        descriptionId: description.id, templateVersionId: current.templateVersionId, workflowId: current.workflowId,
        majorVersion, minorVersion, status: JobDocumentStatus.DRAFT,
        employeeSnapshot: current.employeeSnapshot as Prisma.InputJsonValue,
        companySnapshot: current.companySnapshot as Prisma.InputJsonValue,
        jobSnapshot: current.jobSnapshot as Prisma.InputJsonValue,
        content: current.content as Prisma.InputJsonValue, revisionReason: reason,
        effectiveDate: current.effectiveDate, contentHash: current.contentHash, authorId: actor.id
      } });
      await tx.employeeJobDescription.update({ where: { id }, data: { currentVersionId: created.id, status: JobDocumentStatus.DRAFT } });
      return created;
    });
    await this.audit.record({ userId: actor.id, action: "job_description.revise", entityType: "job_description_version", entityId: version.id, metadata: { descriptionId: id, fromVersion: `${current.majorVersion}.${current.minorVersion}`, toVersion: `${majorVersion}.${minorVersion}`, reason } });
    return this.getDescription(id);
  }

  async archiveDescription(id: string, reasonValue: string, actor: RequestUser) {
    const before = await this.prisma.employeeJobDescription.findFirst({ where: { id, employee: employeeScopeWhere(actor) }, include: { currentVersion: true } });
    if (!before?.currentVersion) throw new NotFoundException("Fiche de poste introuvable.");
    if (before.status === JobDocumentStatus.ARCHIVED) throw new BadRequestException("Cette fiche est déjà archivée.");
    const reason = reasonValue.trim();
    if (!reason) throw new BadRequestException("Le motif d'archivage est obligatoire.");
    await this.prisma.$transaction(async tx => {
      await tx.employeeJobDescription.update({ where: { id }, data: { status: JobDocumentStatus.ARCHIVED, endDate: new Date() } });
      if (before.currentVersion!.status === JobDocumentStatus.DRAFT) await tx.jobDescriptionVersion.update({ where: { id: before.currentVersion!.id }, data: { status: JobDocumentStatus.ARCHIVED, revisionReason: reason } });
    });
    await this.audit.record({ userId: actor.id, action: "job_description.archive", entityType: "employee_job_description", entityId: id, before: { status: before.status }, after: { status: JobDocumentStatus.ARCHIVED, reason } });
    return this.getDescription(id);
  }

  async compareVersions(id: string, fromId: string, toId: string, actor?: RequestUser) {
    if (!fromId || !toId || fromId === toId) throw new BadRequestException("Sélectionnez deux versions différentes.");
    const versions = await this.prisma.jobDescriptionVersion.findMany({ where: { id: { in: [fromId, toId] }, descriptionId: id, description: { employee: employeeScopeWhere(actor) } }, select: { id: true, majorVersion: true, minorVersion: true, content: true, employeeSnapshot: true, companySnapshot: true, jobSnapshot: true, contentHash: true, createdAt: true, revisionReason: true } });
    if (versions.length !== 2) throw new NotFoundException("Une version sélectionnée n'appartient pas à cette fiche.");
    const from = versions.find(row => row.id === fromId)!; const to = versions.find(row => row.id === toId)!;
    return { from, to, changes: jsonChanges({ employeeSnapshot: from.employeeSnapshot, companySnapshot: from.companySnapshot, jobSnapshot: from.jobSnapshot, content: from.content }, { employeeSnapshot: to.employeeSnapshot, companySnapshot: to.companySnapshot, jobSnapshot: to.jobSnapshot, content: to.content }) };
  }

  async previewOrganizationImport(dto: OrganizationImportDto) {
    if (!dto.items.length) throw new BadRequestException("Le fichier d'import ne contient aucune ligne.");
    if (dto.items.length > 1000) throw new BadRequestException("Un import est limité à 1000 postes.");
    const [companies, positions] = await Promise.all([this.prisma.company.findMany(), this.prisma.jobPosition.findMany({ include: { templates: true } })]);
    return dto.items.map((item, index) => {
      const companyCode = item.companyCode?.trim().toUpperCase() || "";
      const company = companyCode ? companies.find(row => row.code === companyCode) : null;
      const companyId = company?.id || null;
      const position = positions.find(row => row.companyId === companyId && (row.code === item.jobCode.trim().toUpperCase() || normalizeText(row.title) === normalizeText(item.jobTitle)));
      const duplicate = position?.templates.some(template => normalizeText(template.name) === normalizeText(`Manuel — ${item.jobTitle}`));
      const invalidCompany = Boolean(companyCode && !company);
      return { index, item: { ...item, companyCode }, companyId, positionId: position?.id || null, status: invalidCompany ? "INVALID_COMPANY" : duplicate ? "DUPLICATE" : position ? "ADD_TEMPLATE" : "CREATE", message: invalidCompany ? `Société ${companyCode} introuvable.` : duplicate ? "Poste et modèle déjà importés." : position ? "Le poste existe : un modèle sera ajouté." : company ? "Nouveau poste et nouveau modèle." : "Nouveau poste commun et nouveau modèle." };
    });
  }

  async importOrganization(dto: OrganizationImportDto, actor: RequestUser) {
    const preview = await this.previewOrganizationImport(dto);
    if (preview.some(row => row.status === "INVALID_COMPANY")) throw new BadRequestException("Corrigez les sociétés inconnues avant de lancer l'import.");
    const results: Array<{ index: number; status: string; positionId?: string; templateId?: string }> = [];
    for (const row of preview) {
      if (row.status === "DUPLICATE") { results.push({ index: row.index, status: "SKIPPED_DUPLICATE", positionId: row.positionId || undefined }); continue; }
      const item = row.item;
      const position = row.positionId ? await this.prisma.jobPosition.findUnique({ where: { id: row.positionId } }) : await this.createPosition({ companyId: row.companyId || undefined, code: item.jobCode, title: item.jobTitle, direction: item.direction, department: item.department, service: item.service, hierarchicalReporting: item.hierarchicalReporting, aliases: [item.jobTitle] }, actor);
      if (!position) throw new NotFoundException("Poste d'import introuvable.");
      const template = await this.createTemplate({ jobPositionId: position.id, companyId: row.companyId || undefined, name: `Manuel — ${item.jobTitle}`, visualTheme: "corporate", orientation: "portrait", content: organizationTemplate(item) }, actor);
      results.push({ index: row.index, status: "IMPORTED", positionId: position.id, templateId: template.id });
    }
    await this.audit.record({ userId: actor.id, action: "job_organization_manual.import", entityType: "job_description_template", metadata: { rows: dto.items.length, imported: results.filter(row => row.status === "IMPORTED").length, skipped: results.filter(row => row.status !== "IMPORTED").length } });
    return { total: dto.items.length, imported: results.filter(row => row.status === "IMPORTED").length, skipped: results.filter(row => row.status !== "IMPORTED").length, results };
  }

  async workflowApprovers() {
    const users = await this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, fullName: true, username: true, roles: { select: { role: { select: { code: true, name: true } } } } }, orderBy: { fullName: "asc" } });
    const roles = await this.prisma.role.findMany({ where: { code: { in: ["ADMIN", "DRH", "GRH", "RESPONSABLE_DEPARTEMENT"] } }, select: { code: true, name: true }, orderBy: { name: "asc" } });
    return { users: users.map(user => ({ id: user.id, fullName: user.fullName, username: user.username, roles: user.roles.map(row => row.role.code) })), roles };
  }

  private validateRequiredBlocks(content: Prisma.JsonValue) {
    const blocks = Array.isArray((content as any)?.blocks) ? (content as any).blocks : [];
    const missing = blocks.filter((block: any) => block.required && block.visible && (block.type === "TASKS" ? !Array.isArray(block.content?.items) || !block.content.items.length : !["COMPANY_HEADER", "EMPLOYEE_IDENTITY", "JOB_IDENTITY", "SIGNATURES", "REVISION_HISTORY"].includes(block.type) && !String(block.content?.text || "").trim())).map((block: any) => block.title);
    if (missing.length) throw new BadRequestException(`Blocs obligatoires incomplets: ${missing.join(", ")}.`);
  }

  private safeStoragePath(relativePath: string) {
    const root = resolve(process.env.JOB_DESCRIPTION_STORAGE_DIR || resolve(process.cwd(), "storage", "job-descriptions"));
    const target = resolve(root, relativePath);
    if (target !== root && !target.startsWith(`${root}${sep}`)) throw new BadRequestException("Chemin d'archive invalide.");
    return target;
  }

  private async loadApproval(id: string, actor?: RequestUser) {
    const approval = await this.prisma.jobDescriptionApproval.findFirst({ where: { id, version: { description: { employee: employeeScopeWhere(actor) } } }, include: { workflowStep: true, version: { include: { description: { include: { employee: true } }, approvals: { include: { workflowStep: true }, orderBy: { workflowStep: { stepOrder: "asc" } } } } } } });
    if (!approval) throw new NotFoundException("Étape de validation introuvable.");
    return approval;
  }

  private assertReviewAllowed(approval: Awaited<ReturnType<JobDescriptionsService["loadApproval"]>>, actor: RequestUser) {
    if (approval.status !== JobApprovalStatus.PENDING || approval.version.status !== JobDocumentStatus.PENDING_APPROVAL) throw new BadRequestException("Cette étape n'est plus en attente.");
    if (!this.isCurrentApproval(approval, approval.version.approvals)) throw new BadRequestException("Une étape précédente doit être validée d'abord.");
    if (!this.canReviewStep(approval.workflowStep, actor)) throw new BadRequestException("Cette étape est attribuée à un autre validateur.");
  }

  private isCurrentApproval(approval: { id: string }, approvals: Array<{ id: string; status: JobApprovalStatus }>) { return approvals.find(row => row.status === JobApprovalStatus.PENDING)?.id === approval.id; }
  private canReviewStep(step: { approverType: JobApproverType; approverUserId: string | null; approverRoleCode: string | null }, actor: RequestUser) { if (actor.roles.includes("ADMIN")) return true; if (step.approverUserId) return step.approverUserId === actor.id; if (step.approverType === JobApproverType.ROLE && step.approverRoleCode) return actor.roles.includes(step.approverRoleCode); return false; }
  private async approverUserIds(step: { approverType: JobApproverType; approverUserId: string | null; approverRoleCode: string | null }) { if (step.approverUserId) return [step.approverUserId]; if (step.approverType === JobApproverType.ROLE && step.approverRoleCode) return this.notifications.userIdsByRoles([step.approverRoleCode]); return this.notifications.adminDrhUserIds(); }

  private loadEmployeeSource(employeeId: string, actor?: RequestUser) {
    return this.prisma.employee.findFirst({
      where: { id: employeeId, ...employeeScopeWhere(actor) },
      include: { group: { include: { subUnit: { include: { unit: true } } } }, sapDirectoryRecords: { orderBy: { updatedAt: "desc" } } }
    }).then(employee => employee || Promise.reject(new NotFoundException("Employé introuvable.")));
  }

  private employeeSourcePayload(employee: Awaited<ReturnType<JobDescriptionsService["loadEmployeeSource"]>>) {
    const sap = employee.sapDirectoryRecords[0] || null;
    return {
      employee: { id: employee.id, matricule: employee.localMatricule || employee.biotimeCode || employee.employeeCode, fullName: employee.fullName, department: employee.department, hireDate: employee.hireDate, status: employee.status },
      sap: sap ? { id: sap.id, sapEmpId: sap.sapEmpId, company: sap.sapCompany, jobTitle: sap.poste, structure: sap.structure, hireDate: sap.hireDate, capturedFrom: "sap_employee_directory" } : null,
      organization: { unit: employee.group?.subUnit?.unit?.name || null, subUnit: employee.group?.subUnit?.name || null, group: employee.group?.name || null }
    };
  }

  private async nextReference(companyId: string, companyCode: string, department: string, jobCode: string) {
    const setting = await this.prisma.documentReferenceSetting.upsert({
      where: { companyId_documentType: { companyId, documentType: "FP" } },
      create: { companyId, documentType: "FP", pattern: "{{doc_type}}-{{company_code}}-{{department_code}}-{{job_code}}-{{sequence}}", nextSequence: 2 },
      update: { nextSequence: { increment: 1 } }
    });
    const sequence = setting.nextSequence - 1;
    return setting.pattern
      .replaceAll("{{doc_type}}", setting.documentType)
      .replaceAll("{{company_code}}", safeCode(companyCode))
      .replaceAll("{{department_code}}", safeCode(department))
      .replaceAll("{{job_code}}", safeCode(jobCode))
      .replaceAll("{{sequence}}", String(sequence).padStart(setting.padding, "0"));
  }
}

function missionData(dto: CreateMissionDto, createdById: string) {
  return { companyId: dto.companyId || null, category: dto.category.trim(), code: optionalText(dto.code)?.toUpperCase(), label: dto.label.trim(), description: optionalText(dto.description), taskType: optionalText(dto.taskType), frequency: optionalText(dto.frequency), priority: dto.priority, essential: dto.essential || false, defaultKpi: dto.defaultKpi as Prisma.InputJsonValue | undefined, createdById };
}
function optionalText(value?: string) { return value?.trim() || null; }
function optionalUpdate(value?: string) { return value === undefined ? undefined : optionalText(value); }
function normalizeText(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " "); }
function uniqueAliases(values?: string[]) { return [...new Set((values || []).map(value => value.trim()).filter(Boolean))]; }
function safeCode(value: string) { return normalizeText(value).replace(/[^A-Z0-9]+/g, "").slice(0, 20) || "GEN"; }
function safeFilename(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160) || "fiche-de-poste"; }
function isPng(buffer: Buffer) { return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); }
function codeFromTitle(title: string) { return safeCode(title).slice(0, 12); }
function contentHash(value: unknown) { return createHash("sha256").update(stableJson(value)).digest("hex"); }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value as object).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`; return JSON.stringify(value); }
function validateBuilderContent(content: Record<string, unknown>) { if (content.schemaVersion !== 1 || !Array.isArray(content.blocks) || !content.page || typeof content.page !== "object") throw new BadRequestException("Le document Builder doit utiliser schemaVersion 1 avec page et blocks."); }
function jsonChanges(before: unknown, after: unknown, path = ""): Array<{ path: string; before: unknown; after: unknown; type: string }> { if (stableJson(before) === stableJson(after)) return []; if (Array.isArray(before) || Array.isArray(after)) return [{ path: path || "document", before, after, type: "CHANGED" }]; if (before && after && typeof before === "object" && typeof after === "object") { const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)]); return [...keys].flatMap(key => jsonChanges((before as any)[key], (after as any)[key], path ? `${path}.${key}` : key)); } return [{ path: path || "document", before, after, type: before === undefined ? "ADDED" : after === undefined ? "REMOVED" : "CHANGED" }]; }
function organizationTemplate(item: { mission?: string; missions?: string[]; responsibilities?: string[]; kpis?: string[]; profile?: string }) { const blocks: any[] = []; let order = 1; const textBlock = (type: string, title: string, text?: string) => { if (text?.trim()) blocks.push({ id: `import-${order}`, type, order: order++, title, visible: true, required: false, editable: true, removable: true, pageBreakBefore: false, style: {}, content: { text: text.trim() } }); }; textBlock("PURPOSE", "Mission du poste", item.mission); if (item.missions?.length) blocks.push({ id: `import-${order}`, type: "TASKS", order: order++, title: "Missions principales", visible: true, required: false, editable: true, removable: true, pageBreakBefore: false, style: {}, content: { items: item.missions.filter(Boolean).map((label, index) => ({ id: `mission-${index + 1}`, label, essential: false, linkedKpiIds: [] })) } }); textBlock("RESPONSIBILITIES", "Responsabilités", item.responsibilities?.filter(Boolean).join("\n• ")); if (item.kpis?.length) blocks.push({ id: `import-${order}`, type: "KPI", order: order++, title: "KPI", visible: true, required: false, editable: true, removable: true, pageBreakBefore: false, style: {}, content: { items: item.kpis.filter(Boolean).map((name, index) => ({ id: `kpi-${index + 1}`, name })) } }); textBlock("EDUCATION", "Profil recherché", item.profile); return { schemaVersion: 1, page: { format: "A4", orientation: "portrait", visualTheme: "corporate" }, blocks }; }
