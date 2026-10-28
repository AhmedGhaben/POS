import { Type } from "class-transformer";
import { ArrayMinSize, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { TAX_ID_PATTERN } from "../../common/dto/address.dto";
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

  /** A buyer for this quote only, typed at the till (no saved customer): name, NIF and address. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  buyerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(TAX_ID_PATTERN, { message: "Use only letters and numbers" })
  buyerTaxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  buyerAddress?: string;

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
