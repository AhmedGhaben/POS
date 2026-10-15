import { Type } from "class-transformer";
import { ArrayMinSize, IsEnum, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { PaymentMethod } from "@prisma/client";

/** SAF-T (AO) PurchaseType: the kinds of supplier document. */
export const SUPPLIER_DOCUMENT_TYPES = ["FT", "FR", "GF", "FG", "AC", "AR", "AF", "TV", "NL", "NC", "RC"] as const;
/** SAF-T DeductibleTaxType / the supplier annex's Tipologia. */
export const DEDUCTIBLE_TYPES = ["MFI", "INV", "OBC", "SERV", "IMPT", "SCE"] as const;

export class PurchaseLineItemInputDto {
  @IsString()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  /** Per unit, without IVA. */
  @IsNumber()
  @Min(0)
  unitCost!: number;
}

/** The supplier's own document for this purchase. */
export class SupplierDocumentDto {
  @IsIn(SUPPLIER_DOCUMENT_TYPES)
  type!: (typeof SUPPLIER_DOCUMENT_TYPES)[number];

  @IsString()
  @MaxLength(60)
  number!: string;

  /** YYYY-MM-DD */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  /** The 4 hash characters printed on it, or "0" when it has none. */
  @IsOptional()
  @Matches(/^([A-Za-z0-9+/=]{4}|0)$/)
  hash?: string;
}

/** IVA charged at one rate. */
export class PurchaseTaxLineDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRate!: number;

  /** What the rate applies to (without IVA). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  base!: number;

  /** The IVA as on the supplier's document; default base × rate, rounded. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number;

  /** How much of the IVA can be deducted (default 100%). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  deductiblePercent?: number;

  @IsOptional()
  @IsIn(DEDUCTIBLE_TYPES)
  typology?: (typeof DEDUCTIBLE_TYPES)[number];
}

/** Paid to the supplier with the purchase (all or part). */
export class PurchasePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  reference?: string;
}

export class CreatePurchaseDto {
  @IsString()
  storeId!: string;

  @IsString()
  supplierId!: string;

  @ValidateNested({ each: true })
  @Type(() => PurchaseLineItemInputDto)
  @ArrayMinSize(1)
  lineItems!: PurchaseLineItemInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SupplierDocumentDto)
  supplierDocument?: SupplierDocumentDto;

  /** IVA per rate; the bases add up to the lines' total. None = no IVA. */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PurchaseTaxLineDto)
  taxLines?: PurchaseTaxLineDto[];

  /** IVA cativo: the share of the supplier's IVA withheld for the State (e.g. 50 or 100). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  withholdingPercent?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PurchasePaymentDto)
  payment?: PurchasePaymentDto;
}
