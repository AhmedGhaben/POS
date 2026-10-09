import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { DrawerOpenReason } from "@prisma/client";

export const DRAWER_SUB_REASONS = ["CASH_PICKUP", "FLOAT_ADJUSTMENT", "MANAGER_INSPECTION", "TEST", "OTHER"] as const;

export class CreateDrawerEventDto {
  @IsString()
  storeId!: string;

  /** Idempotency key generated on the till. */
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsString()
  terminalId?: string;

  @IsEnum(DrawerOpenReason)
  reason!: DrawerOpenReason;

  @IsOptional()
  @IsIn(DRAWER_SUB_REASONS)
  subReason?: (typeof DRAWER_SUB_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  /** The cash sale's own clientId, for SALE_CASH_PAYMENT. */
  @IsOptional()
  @IsUUID()
  saleClientId?: string;

  @IsBoolean()
  succeeded!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  error?: string;

  @IsBoolean()
  offline!: boolean;

  @IsISO8601()
  occurredAt!: string;
}

export class ListDrawerEventsQuery {
  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsEnum(DrawerOpenReason)
  reason?: DrawerOpenReason;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
