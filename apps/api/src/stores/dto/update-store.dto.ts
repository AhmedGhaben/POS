import { Transform } from "class-transformer";
import { IsOptional, IsString, IsTimeZone, MaxLength, MinLength } from "class-validator";

const BlankToNull = () =>
  Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? null : value?.trim?.() ?? value));

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(300)
  address?: string | null;

  @IsOptional() @BlankToNull() @IsString() @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
