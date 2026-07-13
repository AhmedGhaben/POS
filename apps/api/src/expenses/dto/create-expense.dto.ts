import { ExpenseCategory } from "@prisma/client";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

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
