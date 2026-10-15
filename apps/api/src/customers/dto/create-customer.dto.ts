import { PartialType } from "@nestjs/mapped-types";
import { IsEmail, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { AddressFieldsDto, TAX_ID_PATTERN } from "../../common/dto/address.dto";

export class CreateCustomerDto extends AddressFieldsDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** NIF: letters and numbers. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(TAX_ID_PATTERN, { message: "Use only letters and numbers" })
  taxId?: string;

  /** The most they may owe on credit; null = no credit. Owners and managers only. */
  @IsOptional()
  @ValidateIf((o) => o.creditLimit !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit?: number | null;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
