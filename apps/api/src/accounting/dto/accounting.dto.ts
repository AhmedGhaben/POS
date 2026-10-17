import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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
