import { IsEmail, IsOptional, IsString, IsTimeZone, MaxLength, MinLength } from "class-validator";
import { NormalizeEmail } from "../../common/transforms/normalize-email";

export class RegisterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  businessName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  storeName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName!: string;

  @NormalizeEmail()
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /** IANA zone from the browser; the store falls back to UTC when omitted. */
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
