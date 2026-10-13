import { Type } from "class-transformer";
import { ArrayMinSize, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class TransferLineItemInputDto {
  @IsString()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
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
