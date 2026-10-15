import { Type } from "class-transformer";
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";
import { OfflineOverrideDto } from "../../overrides/dto/override.dto";

/** ANNUL_I / ANNUL_N: the only reasons a fiscal document (Angola) may be annulled. */
export const VOID_REASONS = ["WRONG_ITEMS", "CUSTOMER_CHANGED_MIND", "PAYMENT_PROBLEM", "TRAINING", "OTHER", "ANNUL_I", "ANNUL_N"] as const;
export type VoidReason = (typeof VOID_REASONS)[number];

/**
 * Cancels a sale. The till names it by id, or by its own clientId when the
 * sale may not have reached the server yet (cancelled offline).
 */
export class VoidSaleDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  saleId?: string;

  @IsOptional()
  @IsUUID()
  saleClientId?: string;

  @IsIn(VOID_REASONS)
  reason!: VoidReason;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  /** When the cashier cancelled it, for a cancel that was queued offline. */
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  /** Till uploads: who was on the till (see @TillUpload). */
  @IsOptional()
  @IsString()
  actingUserId?: string;

  /** Cancelled offline with a manager's approval checked on the till. */
  @IsOptional()
  @ValidateNested()
  @Type(() => OfflineOverrideDto)
  offlineOverride?: OfflineOverrideDto;
}
