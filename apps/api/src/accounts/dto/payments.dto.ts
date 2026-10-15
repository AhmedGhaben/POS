import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { PaymentMethod } from "@prisma/client";

export class CustomerAllocationDto {
  /** An open invoice (FT) of this customer. */
  @IsString()
  documentId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}

/** Money a customer pays towards their invoices on credit: a receipt (RC). */
export class CreateCustomerPaymentDto {
  @IsString()
  storeId!: string;

  @IsString()
  customerId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  /** Transfer, cheque or Multicaixa reference. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reference?: string;

  /** The till shift it's taken in; needed for cash (it goes into that drawer) and for cashiers. */
  @IsOptional()
  @IsString()
  shiftClientId?: string;

  /** Idempotency key from the page, so a retry doesn't make a second receipt. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string;

  /** Which invoices it pays; omitted = the oldest first. */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CustomerAllocationDto)
  allocations?: CustomerAllocationDto[];
}

export class AnnulPaymentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;
}

export class SupplierAllocationDto {
  @IsString()
  purchaseId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}

/** Money paid to a supplier towards their purchases. */
export class CreateSupplierPaymentDto {
  @IsString()
  supplierId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  reference?: string;

  /** The day it was paid (YYYY-MM-DD); default today in the shop's time zone. */
  @IsOptional()
  @IsDateString({ strict: true })
  paidOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  /** Which purchases it pays; omitted = the oldest first. */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SupplierAllocationDto)
  allocations?: SupplierAllocationDto[];
}
