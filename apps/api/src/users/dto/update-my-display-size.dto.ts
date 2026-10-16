import { IsIn } from "class-validator";

/** Percent of the normal text size (docs/plans/ANGOLA.md, phase 11). */
export const DISPLAY_SIZES = [90, 100, 115, 130];

export class UpdateMyDisplaySizeDto {
  @IsIn(DISPLAY_SIZES, { message: "Unsupported display size" })
  displaySize!: number;
}
