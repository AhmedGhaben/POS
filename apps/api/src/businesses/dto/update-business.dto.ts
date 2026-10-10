import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { SUPPORTED_CURRENCIES } from "../../common/utils/currency";
import { SUPPORTED_LANGUAGES } from "../../common/i18n/languages";

/** Blank text fields clear the value rather than storing "". */
const BlankToNull = () =>
  Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? null : value?.trim?.() ?? value));

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(150)
  legalName?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(50)
  taxId?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(50)
  registrationNumber?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(300)
  address?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(40)
  phone?: string | null;

  @IsOptional() @BlankToNull() @IsEmail()
  email?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(100)
  website?: string | null;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES, { message: "Unsupported currency" })
  currency?: string;

  /** Language of receipts, quotes, invoices and customer emails. */
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES, { message: "Unsupported language" })
  language?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  defaultTaxRate?: number;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(300)
  receiptHeader?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(300)
  receiptFooter?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(1000)
  invoiceFooter?: string | null;
}
