import { IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class AdjustStockDto {
  /** What was counted; up to 3 decimals (kg, litres...). */
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  reorderLevel?: number;

  /** Why the count changed (shown in the stock history). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
