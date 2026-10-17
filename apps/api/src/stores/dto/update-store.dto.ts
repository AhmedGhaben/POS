import { Transform } from "class-transformer";
import { IvaRegime, SaleDocumentFormat } from "@prisma/client";
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsTimeZone, Max, MaxLength, Min, MinLength } from "class-validator";
import { COUNTRIES } from "../../countries";
import { SUPPORTED_LANGUAGES } from "../../common/i18n/languages";

const BlankToNull = () =>
  Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? null : value?.trim?.() ?? value));

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  /** Street and number. */
  @IsOptional() @BlankToNull() @IsString() @MaxLength(300)
  address?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(80)
  city?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(20)
  postalCode?: string | null;

  /** A province code from the country config (checked in the service). */
  @IsOptional() @BlankToNull() @IsString() @MaxLength(10)
  province?: string | null;

  @IsOptional()
  @IsIn(Object.keys(COUNTRIES), { message: "Unsupported country" })
  country?: string;

  /** Owner only (the whole route is); every change is logged. */
  @IsOptional()
  @IsEnum(IvaRegime)
  ivaRegime?: IvaRegime;

  @IsOptional()
  @IsBoolean()
  pricesIncludeTax?: boolean;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  /** What a completed sale prints: the slip (RECEIPT) or the A4 document. */
  @IsOptional()
  @IsEnum(SaleDocumentFormat)
  saleDocumentFormat?: SaleDocumentFormat;

  /** Copies of an A4 fiscal document: Original, Duplicado, Triplicado. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  documentCopies?: number;

  /** "Idioma dos documentos"; null = the country's. */
  @IsOptional() @BlankToNull()
  @IsIn([...SUPPORTED_LANGUAGES], { message: "Unsupported language" })
  documentLanguage?: string | null;
}
