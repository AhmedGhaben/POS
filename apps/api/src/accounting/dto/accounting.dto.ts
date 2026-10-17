import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { JournalKind, TransactionType } from "@prisma/client";

export const GROUPINGS = ["PER_DOCUMENT", "DAILY_SUMMARY"] as const;
export const PURCHASES_FILE_RULES = ["AUTO", "ALWAYS", "NEVER"] as const;

/** Switches the books on (or changes how POS documents are posted). */
export class AccountingSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** POS documents from this day on are posted automatically (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @IsOptional()
  @IsBoolean()
  cashPerTill?: boolean;

  @IsOptional()
  @IsIn(GROUPINGS)
  grouping?: (typeof GROUPINGS)[number];

  @IsOptional()
  @IsBoolean()
  autoPost?: boolean;

  @IsOptional()
  @IsIn(PURCHASES_FILE_RULES)
  purchasesFile?: (typeof PURCHASES_FILE_RULES)[number];
}

export class CreateAccountDto {
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateFiscalYearDto {
  @IsInt()
  @Min(2000)
  @Max(9999)
  year!: number;
}

/** Why a closed period (or year) is opened again: kept in the audit log. */
export class ReopenDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class EntryLineDto {
  @IsString()
  accountId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debit?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

/** A manual entry (lançamento): it must balance before it's saved. */
export class CreateEntryDto {
  @IsString()
  journalId!: string;

  /** The date on the document behind it (YYYY-MM-DD). */
  @IsDateString({ strict: true })
  transactionDate!: string;

  /** The date it counts in the books; defaults to the transaction date. */
  @IsOptional()
  @IsDateString({ strict: true })
  postingDate?: string;

  /** 1-15 (13-15 only on 31 December); defaults to the posting date's month. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15)
  period?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @IsOptional()
  @IsEnum(TransactionType)
  transactionType?: TransactionType;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => EntryLineDto)
  lines!: EntryLineDto[];
}

export class ReverseEntryDto {
  /** The estorno's date (default today). */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class CreateJournalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsEnum(JournalKind)
  kind!: JournalKind;
}

export class UpdateJournalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TemplateLineDto {
  @IsString()
  accountId!: string;

  @IsIn(["D", "C"])
  side!: "D" | "C";

  /** Left out when it's typed each time. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

/** A lançamento pré-definido. */
export class EntryTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  journalId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @IsOptional()
  @IsEnum(TransactionType)
  transactionType?: TransactionType;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TemplateLineDto)
  lines!: TemplateLineDto[];
}

export class OpeningLineDto {
  @IsString()
  accountId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debit?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit?: number;
}

/** Opening balances for a year: period 0 of the Abertura journal. */
export class OpeningBalancesDto {
  @IsInt()
  @Min(2000)
  @Max(9999)
  year!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => OpeningLineDto)
  lines!: OpeningLineDto[];
}
