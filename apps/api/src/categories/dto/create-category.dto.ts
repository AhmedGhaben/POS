import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from "class-validator";

export class CreateCategoryDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(60)
  name!: string;

  /** 2-6 letters or digits ("ELE"); new products get "ELE-028" suggested. Blank removes it. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() || null : value))
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Z0-9]{2,6}$/, { message: "The SKU prefix is 2 to 6 letters or digits" })
  skuPrefix?: string | null;
}
