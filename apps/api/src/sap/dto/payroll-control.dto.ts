import { PayrollMapTarget } from "@prisma/client";
import { IsBooleanString, IsDateString, IsEnum, IsOptional, IsString } from "class-validator";

export class PayrollControlQueryDto {
  @IsString()
  period!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBooleanString()
  onlyDiff?: string;
}

export class UpdatePayrollRubricMappingDto {
  @IsEnum(PayrollMapTarget)
  mapsTo!: PayrollMapTarget;
}
