import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
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

  @IsOptional()
  @IsString()
  customerId?: string;

  @ValidateNested({ each: true })
  @Type(() => SalePaymentInputDto)
  @ArrayMinSize(1)
  payments!: SalePaymentInputDto[];

  @ValidateNested({ each: true })
  @Type(() => SaleLineItemInputDto)
  @ArrayMinSize(1)
  lineItems!: SaleLineItemInputDto[];
}
