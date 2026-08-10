import { Type } from "class-transformer";
import { IsArray, IsDateString, IsIn, IsOptional, IsUUID, ValidateNested } from "class-validator";

export class BatchShiftEntryDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsIn(["MORNING", "EVENING", "NIGHT", "FLEXIBLE", "REPOS", "SEC_MORNING", "SEC_NIGHT", null])
  shiftType: "MORNING" | "EVENING" | "NIGHT" | "FLEXIBLE" | "REPOS" | "SEC_MORNING" | "SEC_NIGHT" | null;
}

export class BatchAssignShiftsDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchShiftEntryDto)
  entries: BatchShiftEntryDto[];
}
