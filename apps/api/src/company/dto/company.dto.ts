import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { PartialType } from "@nestjs/mapped-types";

export class CreateBankAccountDto {
  /** A bank code from the country config, or "OTHER" with bankName. */
  @IsString()
  @MaxLength(20)
  bankCode!: string;

  /** Required for "OTHER"; for listed banks the list's name is used. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  accountHolder!: string;

  /** Spaces are fine; checked and stored without them. */
  @IsString()
  @MaxLength(50)
  iban!: string;

  @IsOptional()
  @IsBoolean()
  showOnQuotes?: boolean;

  @IsOptional()
  @IsBoolean()
  showOnInvoices?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateBankAccountDto extends PartialType(CreateBankAccountDto) {}

export const TAX_CODES = ["NOR", "RED", "INT", "OUT"] as const;

export class CreateTaxRateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsIn(TAX_CODES)
  taxCode!: (typeof TAX_CODES)[number];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percentage!: number;

  /** "AO", or the country's special region (AO-CAB). */
  @IsString()
  @MaxLength(10)
  region!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class UpdateTaxRateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Becomes the rate new products get; the previous default stops being it. */
  @IsOptional()
  @IsIn([true])
  isDefault?: true;

  @IsOptional()
  @IsBoolean()
  verifyValidity?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
