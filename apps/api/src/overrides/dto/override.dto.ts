import { Permission } from "@prisma/client";
import { IsEnum, IsObject, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class RequestOverrideDto {
  /** The manager approving it. */
  @IsString()
  @MaxLength(64)
  approverId!: string;

  @Matches(/^\d{4,6}$/, { message: "Wrong PIN" })
  pin!: string;

  @IsEnum(Permission)
  permission!: Permission;

  /** What it's for, e.g. "sale.discount" or "cash.out". */
  @IsString()
  @MaxLength(60)
  action!: string;

  @IsOptional()
  @IsString()
  storeId?: string;

  /** Shown in the audit trail (amounts, product, reason…). */
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class ApproversQuery {
  @IsEnum(Permission)
  permission!: Permission;

  @IsOptional()
  @IsString()
  storeId?: string;
}

/** On an upload made offline: the till checked this approver's PIN itself. */
export class OfflineOverrideDto {
  @IsString()
  @MaxLength(64)
  approverId!: string;

  @IsEnum(Permission)
  permission!: Permission;
}
