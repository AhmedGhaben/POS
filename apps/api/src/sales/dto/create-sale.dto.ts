import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { PaymentMethod } from "@prisma/client";

export class SaleLineItemInputDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
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
}

/** Present when the till rang the sale up without reaching the server. */
export class OfflineSaleInfoDto {
  @IsISO8601()
  createdAt!: string;
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

  @ValidateNested({ each: true })
  @Type(() => SalePaymentInputDto)
  @ArrayMinSize(1)
  payments!: SalePaymentInputDto[];

  @ValidateNested({ each: true })
  @Type(() => SaleLineItemInputDto)
  @ArrayMinSize(1)
  lineItems!: SaleLineItemInputDto[];
}
