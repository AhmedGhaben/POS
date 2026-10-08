import { IsEmail } from "class-validator";
import { NormalizeEmail } from "../../common/transforms/normalize-email";

export class ForgotPasswordDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;
}
