import { Type } from "class-transformer";
import { ArrayMinSize, IsInt, IsNumber, IsString, Min, ValidateNested } from "class-validator";

export class PurchaseLineItemInputDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;
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
}
