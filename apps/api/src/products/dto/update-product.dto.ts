import { PartialType } from "@nestjs/mapped-types";
import { IsArray, IsBoolean, IsNumberString, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CreateProductDto } from "./create-product.dto";

class ArchiveStockDto {
  @IsString()
  storeId!: string;

  @IsNumberString()
  quantity!: string;
}

/** Any subset of the product's fields; `categoryId: null` clears the
 * category and `isActive: false` archives the product (true restores it). */
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Stock reviewed by the user, including [] for confirmed zero stock. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArchiveStockDto)
  archiveStock?: ArchiveStockDto[];
}
