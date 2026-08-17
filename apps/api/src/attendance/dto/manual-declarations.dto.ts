import { ExceptionalLeaveReason, LeaveType, OvertimeRateType } from "@prisma/client";
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

export class CreateOvertimeDeclarationDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  date!: string;

  @IsNumber()
  @Min(0.25)
  @Max(24)
  hours!: number;

  @IsEnum(OvertimeRateType)
  rateType!: OvertimeRateType;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateAbsenceCompensationDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  absenceDate!: string;

  @IsDateString()
  compensationDate!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateSickLeaveDeclarationDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  dateStart!: string;

  @IsDateString()
  dateEnd!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateSickLeaveDeclarationDto {
  @IsDateString()
  dateStart!: string;
  @IsDateString()
  dateEnd!: string;
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateLeaveDeclarationDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsEnum(LeaveType)
  leaveType?: LeaveType;

  @IsOptional()
  @IsEnum(ExceptionalLeaveReason)
  exceptionalReason?: ExceptionalLeaveReason;

  @IsDateString()
  dateStart!: string;

  @IsDateString()
  dateEnd!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateLeaveDeclarationDto {
  @IsEnum(LeaveType)
  leaveType!: LeaveType;
  @IsOptional()
  @IsEnum(ExceptionalLeaveReason)
  exceptionalReason?: ExceptionalLeaveReason;
  @IsDateString()
  dateStart!: string;
  @IsDateString()
  dateEnd!: string;
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateAbsenceReversalRequestDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  absenceDate!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
