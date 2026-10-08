import { Role } from "@prisma/client";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";
import { NormalizeEmail } from "../../common/transforms/normalize-email";

/** Roles an owner can hand out. Additional owners are out of scope. */
export const STAFF_ROLES = [Role.CASHIER, Role.MANAGER] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * A login for a staff member. Exactly one of `password` (owner sets it now)
 * or `sendInvite: true` (staff member sets it from an emailed link).
 */
export class StaffLoginDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;

  @IsIn(STAFF_ROLES)
  role!: StaffRole;

  @IsArray()
  @ArrayMinSize(1, { message: "Pick at least one store" })
  @ArrayUnique()
  @IsString({ each: true })
  storeIds!: string[];

  @ValidateIf((o: StaffLoginDto) => !o.sendInvite)
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean;
}
