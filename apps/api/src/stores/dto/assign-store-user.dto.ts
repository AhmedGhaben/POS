import { IsString } from "class-validator";

export class AssignStoreUserDto {
  @IsString()
  userId!: string;
}
