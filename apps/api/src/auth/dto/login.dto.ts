import { IsEmail, IsString, MinLength } from "class-validator";
import { NormalizeEmail } from "../../common/transforms/normalize-email";

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
