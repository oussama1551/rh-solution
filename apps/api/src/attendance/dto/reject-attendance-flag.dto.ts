import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class RejectAttendanceFlagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
