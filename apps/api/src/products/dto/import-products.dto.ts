import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

/** The web app sends at most this many rows per request (one transaction each). */
export const IMPORT_CHUNK_SIZE = 1000;

/**
 * One parsed CSV row. Optional fields that are absent mean "leave as is"
 * when updating an existing product.
 */
export class ImportProductRowDto {
  /** Line number in the user's file, echoed back in skip reasons. */
  @IsInt() @Min(1)
  line!: number;

  @IsString() @MinLength(1) @MaxLength(64)
  sku!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(64)
  barcode?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  category?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  costPrice?: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  sellPrice!: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  taxRate?: number;

  /** Sets (not adds to) the quantity at `storeId`. */
  @IsOptional() @IsInt() @Min(0)
  stock?: number;
}

export class ImportProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_CHUNK_SIZE)
  @ValidateNested({ each: true })
  @Type(() => ImportProductRowDto)
  rows!: ImportProductRowDto[];

  @IsBoolean()
  updateExisting!: boolean;

  @IsBoolean()
  createCategories!: boolean;

  /** Store whose stock the `stock` column sets; required when any row has stock. */
  @IsOptional() @IsString()
  storeId?: string;
}
