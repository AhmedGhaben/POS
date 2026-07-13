import { Type } from "class-transformer";
import { ArrayMinSize, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class TransferLineItemInputDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateTransferDto {
  @IsString()
  fromStoreId!: string;

  @IsString()
  toStoreId!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @ValidateNested({ each: true })
  @Type(() => TransferLineItemInputDto)
  @ArrayMinSize(1)
  lineItems!: TransferLineItemInputDto[];
}
