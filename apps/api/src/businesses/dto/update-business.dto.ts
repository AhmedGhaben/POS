import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { SUPPORTED_CURRENCIES } from "../../common/utils/currency";
import { SUPPORTED_LANGUAGES } from "../../common/i18n/languages";
import { COUNTRIES } from "../../countries";

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

  /** NIF: letters and digits (Angola, e.g. 000415195LA035), spaces and dashes allowed. */
  @IsOptional() @BlankToNull() @IsString() @MaxLength(50) @Matches(/^[A-Za-z0-9][A-Za-z0-9 .-]*$/, { message: "Use only letters and numbers" })
  taxId?: string | null;

  /** Número de Registo Comercial: letters and numbers. */
  @IsOptional() @BlankToNull() @IsString() @MaxLength(50)
  registrationNumber?: string | null;

  /** A legal form code from the country config (checked in the service). */
  @IsOptional() @BlankToNull() @IsString() @MaxLength(20)
  legalForm?: string | null;

  /** CAE (economic activity code). */
  @IsOptional() @BlankToNull() @IsString() @MaxLength(10) @Matches(/^[0-9A-Za-z.]+$/, { message: "Use only letters and numbers" })
  eacCode?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(300)
  address?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(80)
  city?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(20)
  postalCode?: string | null;

  /** A province code from the country config. */
  @IsOptional() @BlankToNull() @IsString() @MaxLength(10)
  province?: string | null;

  @IsOptional()
  @IsIn(Object.keys(COUNTRIES), { message: "Unsupported country" })
  country?: string;

  /** Documents go to AGT in real time: the monthly SAF-T reminder stops. */
  @IsOptional()
  @IsBoolean()
  eInvoicingActive?: boolean;

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

  /** A shift's cash difference above this (either way) is flagged; null = never. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shiftDifferenceThreshold?: number | null;

  /** null removes the limit. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  maxDiscountPercent?: number | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(300)
  receiptHeader?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(300)
  receiptFooter?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(1000)
  invoiceFooter?: string | null;
}
