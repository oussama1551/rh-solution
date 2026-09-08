import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

export class CreateCompanyDto {
  @IsString() @IsNotEmpty() @MaxLength(30) code: string;
  @IsString() @IsNotEmpty() @MaxLength(180) officialName: string;
  @IsString() @IsNotEmpty() @MaxLength(100) shortName: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() @MaxLength(80) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;
  @IsOptional() @IsString() legalInfo?: string;
  @IsOptional() @IsString() @MaxLength(20) primaryColor?: string;
  @IsOptional() @IsString() footerText?: string;
}

export class UpdateCompanyDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(180) officialName?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) shortName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() @MaxLength(80) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;
  @IsOptional() @IsString() legalInfo?: string;
  @IsOptional() @IsString() @MaxLength(20) primaryColor?: string;
  @IsOptional() @IsString() footerText?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateJobPositionDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() @IsNotEmpty() @MaxLength(80) code: string;
  @IsString() @IsNotEmpty() @MaxLength(180) title: string;
  @IsOptional() @IsString() @MaxLength(180) direction?: string;
  @IsOptional() @IsString() @MaxLength(180) department?: string;
  @IsOptional() @IsString() @MaxLength(180) service?: string;
  @IsOptional() @IsString() @MaxLength(240) hierarchicalReporting?: string;
  @IsOptional() @IsString() @MaxLength(240) functionalReporting?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
}

export class UpdateJobPositionDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(180) title?: string;
  @IsOptional() @IsString() @MaxLength(180) direction?: string;
  @IsOptional() @IsString() @MaxLength(180) department?: string;
  @IsOptional() @IsString() @MaxLength(180) service?: string;
  @IsOptional() @IsString() @MaxLength(240) hierarchicalReporting?: string;
  @IsOptional() @IsString() @MaxLength(240) functionalReporting?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
}

export class CreateTemplateDto {
  @IsUUID() jobPositionId: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() workflowId?: string;
  @IsString() @IsNotEmpty() @MaxLength(180) name: string;
  @IsOptional() @IsString() @MaxLength(40) visualTheme?: string;
  @IsOptional() @IsString() @MaxLength(20) orientation?: string;
  @IsObject() content: Record<string, unknown>;
  @IsOptional() @IsObject() validationRules?: Record<string, unknown>;
}

export class UpdateTemplateDraftDto {
  @IsObject() content: Record<string, unknown>;
  @IsOptional() @IsObject() validationRules?: Record<string, unknown>;
  @IsOptional() @IsString() revisionReason?: string;
}

export class CreateMissionDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() @IsNotEmpty() @MaxLength(120) category: string;
  @IsOptional() @IsString() @MaxLength(80) code?: string;
  @IsString() @IsNotEmpty() @MaxLength(240) label: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(80) taskType?: string;
  @IsOptional() @IsString() @MaxLength(40) frequency?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10) priority?: number;
  @IsOptional() @IsBoolean() essential?: boolean;
  @IsOptional() @IsObject() defaultKpi?: Record<string, unknown>;
}

export class UpdateMissionDto extends CreateMissionDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class WorkflowStepDto {
  @IsInt() @Min(1) stepOrder: number;
  @IsString() @IsNotEmpty() @MaxLength(160) label: string;
  @IsString() approverType: "MANAGER" | "ROLE" | "USER" | "EMPLOYEE";
  @IsOptional() @IsString() @MaxLength(60) approverRoleCode?: string;
  @IsOptional() @IsUUID() approverUserId?: string;
  @IsOptional() @IsBoolean() signatureRequired?: boolean;
  @IsOptional() @IsBoolean() stampRequired?: boolean;
}

export class CreateWorkflowDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDto) steps: WorkflowStepDto[];
}

export class CreateEmployeeJobDescriptionDto {
  @IsUUID() employeeId: string;
  @IsUUID() companyId: string;
  @IsOptional() @IsUUID() jobPositionId?: string;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsString() @MaxLength(180) selectedJobTitle?: string;
  @IsOptional() @IsString() @MaxLength(240) managerName?: string;
  @IsOptional() @IsString() @MaxLength(180) managerJobTitle?: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
}

export class UpdateJobDescriptionDraftDto {
  @IsObject() content: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(180) selectedJobTitle?: string;
  @IsOptional() @IsString() @MaxLength(240) managerName?: string;
  @IsOptional() @IsString() @MaxLength(180) managerJobTitle?: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
}

export class ResolveJobVariablesDto {
  @IsObject() content: Record<string, unknown>;
  @IsObject() context: Record<string, unknown>;
  @IsOptional() @IsBoolean() useSamples?: boolean;
}

export class ReviewJobDescriptionDto {
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class SetTemplateWorkflowDto {
  @IsOptional() @IsUUID() workflowId?: string;
}

export class ReviseJobDescriptionDto {
  @IsString() bump: "MINOR" | "MAJOR";
  @IsString() @IsNotEmpty() @MaxLength(2000) reason: string;
}

export class ArchiveJobDescriptionDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) reason: string;
}

export class OrganizationImportItemDto {
  @IsOptional() @IsString() @MaxLength(30) companyCode?: string;
  @IsString() @IsNotEmpty() @MaxLength(80) jobCode: string;
  @IsString() @IsNotEmpty() @MaxLength(180) jobTitle: string;
  @IsOptional() @IsString() @MaxLength(180) direction?: string;
  @IsOptional() @IsString() @MaxLength(180) department?: string;
  @IsOptional() @IsString() @MaxLength(180) service?: string;
  @IsOptional() @IsString() @MaxLength(240) hierarchicalReporting?: string;
  @IsOptional() @IsString() mission?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) responsibilities?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) missions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) kpis?: string[];
  @IsOptional() @IsString() profile?: string;
}

export class OrganizationImportDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => OrganizationImportItemDto) items: OrganizationImportItemDto[];
}
