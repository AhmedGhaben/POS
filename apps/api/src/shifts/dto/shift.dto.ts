import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

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
}

export class CloseShiftDto extends TillEventDto {
  @IsUUID()
  shiftClientId!: string;

  /** What the cashier counted in the drawer. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedCash!: number;

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
