import { Type } from "class-transformer";
import { ArrayMinSize, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class ReturnLineItemInputDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
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

  @ValidateNested({ each: true })
  @Type(() => ReturnLineItemInputDto)
  @ArrayMinSize(1)
  lineItems!: ReturnLineItemInputDto[];
}
