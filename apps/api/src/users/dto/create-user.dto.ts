import { IsArray, IsEmail, IsOptional, IsString, MinLength, IsBoolean } from "class-validator";

export class CreateUserDto {
  @IsString()
  username: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  fullName: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsArray()
  @IsString({ each: true })
  roleCodes: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
