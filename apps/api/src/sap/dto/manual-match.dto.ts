import { IsString } from "class-validator";

export class ManualMatchDto {
  @IsString()
  sapEmpId!: string;
}
