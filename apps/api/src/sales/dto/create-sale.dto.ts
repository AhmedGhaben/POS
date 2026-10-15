import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsISO8601,
  IsInt,
  Matches,
  MaxLength,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { PaymentMethod, Permission } from "@prisma/client";
import { OfflineOverrideDto } from "../../overrides/dto/override.dto";

export class SaleOverrideDto {
  @IsEnum(Permission)
  permission!: Permission;

  @IsString()
  token!: string;
}

/** A discount as the cashier gave it: a percentage or an amount off. */
export class DiscountDto {
  @IsIn(["PERCENT", "AMOUNT"])
  type!: "PERCENT" | "AMOUNT";

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value!: number;
}

export class SaleLineItemInputDto {
  @IsString()
  productId!: string;

  /** Up to 3 decimals (kg, litres...); whole for products sold by the unit. */
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  /** Offline sales only: the price the till charged. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  /** Offline sales only: the tax rate (%) the till applied. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  /** Off this line. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;
}

/** The number the till gave the sale's document in its own series ("FR POS001-2026/57"). */
export class FiscalNumberDto {
  @Matches(/^[A-Z0-9]+-\d{4}$/)
  series!: string;

  @IsInt()
  @Min(1)
  number!: number;

  /** The till's signature (RSA-SHA1, Base64) over the document and the previous one's hash. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9+/=]{20,700}$/)
  hash?: string;

  /** When the till signed it (its SystemEntryDate). */
  @IsOptional()
  @IsISO8601()
  signedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  keyVersion?: string;
}

/** Present when the till rang the sale up without reaching the server. */
export class OfflineSaleInfoDto {
  @IsISO8601()
  createdAt!: string;

  /** Whether the till's prices included tax (the store's setting as the till had it). */
  @IsOptional()
  @IsBoolean()
  pricesIncludeTax?: boolean;
}

export class SalePaymentInputDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tendered?: number;
}

export class CreateSaleDto {
  @IsString()
  storeId!: string;

  /** Idempotency key from the till; required for offline sales. */
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  terminalId?: string;

  /** Till uploads: who was on the till (see @TillUpload). */
  @IsOptional()
  @IsString()
  actingUserId?: string;

  /** The till's id for its open shift. Required online; old offline uploads may lack it. */
  @IsOptional()
  @IsUUID()
  shiftClientId?: string;

  /** Online: managers' approvals (POST /overrides) for a price change or discounts. */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SaleOverrideDto)
  overrides?: SaleOverrideDto[];

  /** Offline: approvals the till checked itself. */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OfflineOverrideDto)
  offlineOverrides?: OfflineOverrideDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => OfflineSaleInfoDto)
  offline?: OfflineSaleInfoDto;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEmail()
  receiptEmail?: string;

  /** What was paid now; may be empty when it all goes on the customer's account (creditAmount). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentInputDto)
  payments!: SalePaymentInputDto[];

  /**
   * The part left on the customer's account (a sale on credit, SELL_ON_CREDIT):
   * the document is then a Factura (FT) and what was paid gets a receipt.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditAmount?: number;

  @ValidateNested({ each: true })
  @Type(() => SaleLineItemInputDto)
  @ArrayMinSize(1)
  lineItems!: SaleLineItemInputDto[];

  /** Off the whole sale, after the lines' own discounts. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;

  /** A till numbers its own documents; without this the server numbers it. */
  @IsOptional()
  @ValidateNested()
  @Type(() => FiscalNumberDto)
  fiscal?: FiscalNumberDto;

  /** The proforma this sale invoices (it becomes "invoiced"). */
  @IsOptional()
  @IsString()
  proformaId?: string;
}
