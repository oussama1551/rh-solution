import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class EmployeeContractDto {
  @IsUUID() employeeId!: string;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() @MaxLength(100) contractType?: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() note?: string;
}

export class AttendanceExemptionDto {
  @IsBoolean() exempt!: boolean;
  @IsOptional() @IsString() reason?: string;
}
