import { IsEmail, IsEnum, IsString, MinLength } from "class-validator";
import { Role } from "@prisma/client";

export class CreateUserDto {
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
