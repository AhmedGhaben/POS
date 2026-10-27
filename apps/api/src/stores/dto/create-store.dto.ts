import { Transform } from "class-transformer";
import { IvaRegime } from "@prisma/client";
import { IsEnum, IsIn, IsOptional, IsString, IsTimeZone, MaxLength, MinLength } from "class-validator";
import { SUPPORTED_LANGUAGES } from "../../common/i18n/languages";

const BlankToNull = () =>
  Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? null : value?.trim?.() ?? value));

/** A new store; what isn't given comes from the business's country. */
export class CreateStoreDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /** Street and number. */
  @IsOptional() @BlankToNull() @IsString() @MaxLength(300)
  address?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(80)
  city?: string | null;

  /** A province code from the country config (checked in the service). */
  @IsOptional() @BlankToNull() @IsString() @MaxLength(10)
  province?: string | null;

  /** Default: the country's (Regime Geral in Angola). */
  @IsOptional()
  @IsEnum(IvaRegime)
  ivaRegime?: IvaRegime;

  /** "Idioma dos documentos"; null or missing = the country's. */
  @IsOptional() @BlankToNull()
  @IsIn([...SUPPORTED_LANGUAGES], { message: "Unsupported language" })
  documentLanguage?: string | null;

  /** Default: the country's (Africa/Luanda in Angola). */
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
