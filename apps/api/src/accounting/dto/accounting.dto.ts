import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

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
