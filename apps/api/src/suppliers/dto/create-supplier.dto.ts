import { PartialType } from "@nestjs/mapped-types";
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { AddressFieldsDto, TAX_ID_PATTERN } from "../../common/dto/address.dto";

export class CreateSupplierDto extends AddressFieldsDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  /** NIF (for purchases in SAF-T and the IVA return's supplier annex). */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(TAX_ID_PATTERN, { message: "Use only letters and numbers" })
  taxId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
