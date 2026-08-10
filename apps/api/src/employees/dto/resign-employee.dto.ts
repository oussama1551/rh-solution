import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class ResignEmployeeDto {
  @IsDateString()
  resignDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  resignType?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
