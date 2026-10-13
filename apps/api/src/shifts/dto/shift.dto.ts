import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { OfflineOverrideDto } from "../../overrides/dto/override.dto";

export const CASH_MOVEMENT_REASONS = ["CASH_PICKUP", "PETTY_CASH", "CHANGE_TOPUP", "OTHER"] as const;

/** Fields every shift event from a till carries. */
class TillEventDto {
  @IsString()
  storeId!: string;

  /** Recorded while the till couldn't reach the server. */
  @IsOptional()
  @IsBoolean()
  offline?: boolean;

  /** Till uploads: who was on the till (see @TillUpload). */
  @IsOptional()
  @IsString()
  actingUserId?: string;
}

export class OpenShiftDto extends TillEventDto {
  /** The till's own id for the shift; sales and the close refer to it. */
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsString()
  terminalId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingFloat!: number;

  @IsOptional()
  @IsISO8601()
  openedAt?: string;
}

export class CashMovementDto extends TillEventDto {
  @IsUUID()
  shiftClientId!: string;

  @IsUUID()
  clientId!: string;

  @IsIn(["IN", "OUT"])
  type!: "IN" | "OUT";

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsIn(CASH_MOVEMENT_REASONS)
  reason!: (typeof CASH_MOVEMENT_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  /** Offline cash out by someone without CASH_OUT: the approver the till checked. */
  @IsOptional()
  @ValidateNested()
  @Type(() => OfflineOverrideDto)
  offlineOverride?: OfflineOverrideDto;
}

export class CloseShiftDto extends TillEventDto {
  @IsUUID()
  shiftClientId!: string;

  /** What the cashier counted in the drawer. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedCash!: number;

  /** The blind count by note/coin: { "5000": 3, "200": 4 } (value → how many). */
  @IsOptional()
  @IsObject()
  countedDenominations?: Record<string, number>;

  /** What the till expected, from its own records. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  tillExpectedCash?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsISO8601()
  closedAt?: string;
}

export class ListShiftsQuery {
  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsIn(["OPEN", "CLOSED"])
  status?: "OPEN" | "CLOSED";

  /** Only shifts whose difference went over the threshold. */
  @IsOptional()
  @IsIn(["true", "false"])
  flagged?: "true" | "false";

  /** Opened by this cashier. */
  @IsOptional()
  @IsString()
  cashierId?: string;

  @IsOptional()
  @IsString()
  terminalId?: string;

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
