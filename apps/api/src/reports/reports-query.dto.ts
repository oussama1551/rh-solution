import { EmployeeStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID } from "class-validator";

export class ReportsQueryDto {
  @IsOptional()
  @IsIn(["summary", "detailed"])
  mode?: "summary" | "detailed";
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  subUnitId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

}
