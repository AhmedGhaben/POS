import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Permission, Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsService } from "../common/permissions/permissions.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService } from "./products.service";

/** Strips costPrice for callers without VIEW_COST_PRICE — margin data is
 * sensitive even though the product listing itself is open to every role
 * (a Cashier needs to browse/search products at checkout). */
function redactCostPrice<T extends { costPrice: unknown }>(product: T): Omit<T, "costPrice"> {
  const { costPrice: _costPrice, ...rest } = product;
  return rest;
}

@Controller("products")
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("search") search?: string,
    @Query("categoryId") categoryId?: string,
  ) {
    const products = await this.productsService.findAll(user.businessId, search, categoryId);
    const canViewCostPrice = await this.permissionsService.hasPermission(
      user.userId,
      user.role,
      Permission.VIEW_COST_PRICE,
    );
    return canViewCostPrice ? products : products.map(redactCostPrice);
  }

  @Get("barcode/:barcode")
  async findByBarcode(@CurrentUser() user: AuthenticatedUser, @Param("barcode") barcode: string) {
    const product = await this.productsService.findByBarcode(user.businessId, barcode);
    const canViewCostPrice = await this.permissionsService.hasPermission(
      user.userId,
      user.role,
      Permission.VIEW_COST_PRICE,
    );
    return canViewCostPrice ? product : redactCostPrice(product);
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
