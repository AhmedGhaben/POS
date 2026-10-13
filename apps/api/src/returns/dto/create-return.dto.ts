import { Type } from "class-transformer";
import { ArrayMinSize, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from "class-validator";
import { PaymentMethod } from "@prisma/client";

export class ReturnLineItemInputDto {
  @IsString()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;
}

export class CreateReturnDto {
  @IsString()
  storeId!: string;

  @IsString()
  saleId!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  /** How the money goes back (default cash). */
  @IsOptional()
  @IsEnum(PaymentMethod)
  refundMethod?: PaymentMethod;

  /** The till's open shift, so a cash refund comes out of its expected cash. */
  @IsOptional()
  @IsUUID()
  shiftClientId?: string;

  @ValidateNested({ each: true })
  @Type(() => ReturnLineItemInputDto)
  @ArrayMinSize(1)
  lineItems!: ReturnLineItemInputDto[];
}
