import { IsBoolean, IsEnum, IsOptional } from "class-validator";
import { Permission } from "@prisma/client";

export class UpdateUserPermissionDto {
  @IsEnum(Permission)
  permission!: Permission;

  /** Omit (or send null) to clear the override and revert to the role default. */
  @IsOptional()
  @IsBoolean()
  granted?: boolean | null;
}
