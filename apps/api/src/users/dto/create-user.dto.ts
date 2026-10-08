import { IsEmail, IsEnum, IsString, MinLength } from "class-validator";
import { Role } from "@prisma/client";
import { NormalizeEmail } from "../../common/transforms/normalize-email";

export class CreateUserDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEnum(Role)
  role!: Role;
}
