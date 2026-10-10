import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional } from "class-validator";
import { CreateProductDto } from "./create-product.dto";

/** Any subset of the product's fields; `categoryId: null` clears the
 * category and `isActive: false` archives the product (true restores it). */
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
