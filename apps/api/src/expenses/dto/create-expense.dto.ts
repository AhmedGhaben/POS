import { ExpenseCategory } from "@prisma/client";
import { OmitType, PartialType } from "@nestjs/mapped-types";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class CreateExpenseDto {
  @IsString()
  storeId!: string;

  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsDateString()
  incurredAt?: string;
}

/** PATCH /expenses/:id, only before the expense is posted to accounting. */
export class UpdateExpenseDto extends PartialType(OmitType(CreateExpenseDto, ["storeId"] as const)) {}

export class CancelExpenseDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;
}
