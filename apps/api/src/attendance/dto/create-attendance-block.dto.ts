import { IsDateString, IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateAttendanceBlockDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
