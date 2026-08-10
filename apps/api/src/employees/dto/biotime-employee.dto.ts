import { IsDateString, IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class BioTimeEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  empCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  employmentType?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  superior?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  workflowRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  localName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  gender?: string;

  @IsOptional()
  @IsDateString()
  birthday?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactTel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  officeTel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  national?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  postcode?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;
}
