import { IsArray, IsBoolean, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateUnitDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isSouthWilaya?: boolean;
}

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isSouthWilaya?: boolean;
}

export class CreateSubUnitDto {
  @IsUUID()
  unitId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isSouthWilaya?: boolean;
}

export class UpdateSubUnitDto {
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isSouthWilaya?: boolean;
}

export class CreateGroupDto {
  @IsUUID()
  subUnitId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsUUID()
  subUnitId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class MoveEmployeeDto {
  @IsOptional()
  @IsUUID()
  groupId?: string | null;
}

export class MoveEmployeesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  employeeIds: string[];

  @IsOptional()
  @IsUUID()
  groupId?: string | null;
}

export class DeleteQueryDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
