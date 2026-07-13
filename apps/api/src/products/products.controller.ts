import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService } from "./products.service";

@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("search") search?: string,
    @Query("categoryId") categoryId?: string,
  ) {
    return this.productsService.findAll(user.businessId, search, categoryId);
  }

  @Get("barcode/:barcode")
  findByBarcode(@CurrentUser() user: AuthenticatedUser, @Param("barcode") barcode: string) {
    return this.productsService.findByBarcode(user.businessId, barcode);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.businessId, dto);
  }

  @Patch(":productId")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("productId") productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.businessId, productId, dto);
  }
}
