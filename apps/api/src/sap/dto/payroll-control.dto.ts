import { PayrollMapTarget } from "@prisma/client";
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID } from "class-validator";

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

  @IsString()
  rubricCodes!: string;

  @IsOptional()
  @IsIn(["pending", "confirmed"])
  tab?: "pending" | "confirmed";
}

export class PayrollControlConfirmationDto {
  @IsUUID()
  employeeId!: string;
  @IsDateString()
  periodStart!: string;
  @IsDateString()
  periodEnd!: string;
  @IsString()
  rubricCodes!: string;
  @IsOptional()
  @IsString()
  note?: string;
}

export class PayrollOperationalQueryDto {
  @IsString()
  period!: string;
  @IsIn(["ABSENCE", "OVERTIME"])
  category!: "ABSENCE" | "OVERTIME";
  @IsOptional()
  @IsString()
  search?: string;
}

export class PayrollOperationalReviewDto {
  @IsString()
  sourceKey!: string;
  @IsString()
  period!: string;
  @IsIn(["ABSENCE", "OVERTIME"])
  category!: "ABSENCE" | "OVERTIME";
  @IsIn(["GOOD", "NOT_GOOD"])
  verdict!: "GOOD" | "NOT_GOOD";
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePayrollRubricMappingDto {
  @IsEnum(PayrollMapTarget)
  mapsTo!: PayrollMapTarget;
}
