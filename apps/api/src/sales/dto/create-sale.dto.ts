import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsEnum,
  IsInt,
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

export class CreateSaleDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ValidateNested({ each: true })
  @Type(() => SaleLineItemInputDto)
  @ArrayMinSize(1)
  lineItems!: SaleLineItemInputDto[];
}
