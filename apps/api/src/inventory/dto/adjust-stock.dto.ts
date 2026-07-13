import { IsInt, IsOptional, Min } from "class-validator";

export class AdjustStockDto {
  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderLevel?: number;
}
