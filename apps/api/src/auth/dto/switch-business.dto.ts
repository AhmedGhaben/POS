import { IsString } from "class-validator";

export class SwitchBusinessDto {
  @IsString()
  businessId!: string;
}
