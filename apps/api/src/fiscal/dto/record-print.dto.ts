import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

/** A fiscal document about to be printed (the print log decides Original or 2ª Via). */
export class RecordPrintDto {
  @IsIn(["RECEIPT", "A4"])
  kind!: "RECEIPT" | "A4";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  copies?: number;
}
