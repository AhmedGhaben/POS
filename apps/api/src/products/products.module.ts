import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductPhotosController } from "./product-photos.controller";
import { ProductsService } from "./products.service";
import { ProductsImportService } from "./products-import.service";

@Module({
  controllers: [ProductsController, ProductPhotosController],
  providers: [ProductsService, ProductsImportService],
  exports: [ProductsService],
})
export class ProductsModule {}
