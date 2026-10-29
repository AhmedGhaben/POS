import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";

export class StockCountLineDto {
  @IsString()
  productId!: string;

  /** What was counted; up to 3 decimals (kg, litres...). */
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(99999999999.999)
  quantity!: number;

  /** Stock shown while counting: refuse a stale count rather than lose a sale. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  expectedQuantity?: number;
}

/** A whole stock count saved at once (tester #41). */
export class CreateStockCountDto {
  @ValidateNested({ each: true })
  @Type(() => StockCountLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  lines!: StockCountLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/** A count file (CSV or Excel, as a data: URL) to preview before applying. */
export class ParseStockCountDto {
  @IsString()
  @MaxLength(200)
  fileName!: string;

  @IsString()
  dataUrl!: string;
}
