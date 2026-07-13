import { IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateProductDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  costPrice!: number;

  @IsNumber()
  @Min(0)
  sellPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;
}
