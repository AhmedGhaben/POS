import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { STAFF_ROLES, StaffRole } from "./staff-login.dto";

export class UpdateStaffAccessDto {
  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;

  /** Replaces the user's store assignments. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "Pick at least one store" })
  @ArrayUnique()
  @IsString({ each: true })
  storeIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
