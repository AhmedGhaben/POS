import { Transform } from "class-transformer";
import { IvaRegime } from "@prisma/client";
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsTimeZone, MaxLength, MinLength } from "class-validator";
import { COUNTRIES } from "../../countries";

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
}
