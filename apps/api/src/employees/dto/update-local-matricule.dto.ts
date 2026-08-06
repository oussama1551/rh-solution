import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateLocalMatriculeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  localMatricule?: string | null;
}
