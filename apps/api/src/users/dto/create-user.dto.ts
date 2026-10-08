import { IsEmail, IsIn, IsString, MinLength } from "class-validator";
import { NormalizeEmail } from "../../common/transforms/normalize-email";
import { STAFF_ROLES, StaffRole } from "./staff-login.dto";

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

  /** Not OWNER — owners only come from sign-up. */
  @IsIn(STAFF_ROLES)
  role!: StaffRole;
}
