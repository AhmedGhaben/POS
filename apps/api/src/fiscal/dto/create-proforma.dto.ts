import { Type } from "class-transformer";
import { ArrayMinSize, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { DiscountDto } from "../../sales/dto/create-sale.dto";

export class ProformaLineDto {
  @IsString()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  /** A price other than the product's (as quoted). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  unitPrice?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;
}

export class CreateProformaDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @ValidateNested({ each: true })
  @Type(() => ProformaLineDto)
  @ArrayMinSize(1)
  lineItems!: ProformaLineDto[];

  /** Days the quote is valid from its date ("Válida até"); 30 when not given. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  validDays?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  discount?: DiscountDto;
}
