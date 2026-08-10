import { IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID } from "class-validator";

export class AssignShiftsDto {
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  employeeIds?: string[];

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsString()
  @IsIn(["MORNING", "EVENING", "NIGHT", "FLEXIBLE", "REPOS", "SEC_MORNING", "SEC_NIGHT"])
  shiftType: "MORNING" | "EVENING" | "NIGHT" | "FLEXIBLE" | "REPOS" | "SEC_MORNING" | "SEC_NIGHT";

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsBoolean()
  includeWeekends?: boolean;
}
