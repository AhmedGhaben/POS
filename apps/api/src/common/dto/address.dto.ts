import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

/** NIFs are alphanumeric in Angola (e.g. 000415195LA035); spaces, dots and dashes allowed. */
export const TAX_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .-]*$/;

/**
 * Structured address (SAF-T: AddressDetail, City, PostalCode, Province,
 * Country) for customers and suppliers.
 */
export class AddressFieldsDto {
  /** Street and number. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  province?: string;

  /** ISO alpha-2; any country for foreign buyers or suppliers. */
  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: "Use a two-letter country code" })
  country?: string;
}

