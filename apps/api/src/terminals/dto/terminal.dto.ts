import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { Transform } from "class-transformer";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class CreateTerminalDto {
  @IsString()
  storeId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

export class UpdateTerminalDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** A new till's name and store, for a pairing code. */
export class CreatePairingCodeDto extends CreateTerminalDto {}

export class PairTerminalDto {
  @Matches(/^\d{6}$/, { message: "That till code isn't valid or has expired" })
  code!: string;
}
