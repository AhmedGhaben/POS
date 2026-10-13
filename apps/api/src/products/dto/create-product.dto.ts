import { SaftProductType } from "@prisma/client";
import { IsBoolean, IsEnum, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { UNIT_CODES } from "../../sales/pricing";

export class CreateProductDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  costPrice!: number;

  @IsNumber()
  @Min(0)
  sellPrice!: number;

  /**
   * The tax, picked by name: a tax rate of the business (`taxRateId`), or
   * exempt with a reason (`exemptionCode`, rate 0). A bare `taxRate` still
   * works (CSV imports, older apps) and is linked to the rate with that
   * percentage when there is one.
   */
  @IsOptional()
  @IsString()
  taxRateId?: string | null;

  @IsOptional()
  @IsString()
  exemptionCode?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  /** un, kg, g, l, m, cx. */
  @IsOptional()
  @IsIn(UNIT_CODES)
  unit?: string;

  @IsOptional()
  @IsEnum(SaftProductType)
  productType?: SaftProductType;

  /** From the country's inventory types (M, P, A, S, T); null for services. */
  @IsOptional()
  @IsString()
  inventoryType?: string | null;

  /** False for services etc.: always sellable, never moves stock. Defaults to true. */
  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;
}
