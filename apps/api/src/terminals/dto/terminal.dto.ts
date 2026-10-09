import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
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
