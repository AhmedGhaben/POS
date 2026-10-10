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
import { ImportProductsDto } from "./dto/import-products.dto";
import { ProductsImportService } from "./products-import.service";

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
    private readonly productsImportService: ProductsImportService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("search") search?: string,
    @Query("categoryId") categoryId?: string,
    @Query("archived") archived?: string,
  ) {
    // Archived products are a back-office view; the till only ever sees active ones.
    const showArchived = archived === "true" && (user.role === Role.OWNER || user.role === Role.MANAGER);
    const products = await this.productsService.findAll(user.businessId, search, categoryId, showArchived);
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

  /** CSV import: upserts by SKU, at most 1,000 rows per request. */
  @Post("import")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  import(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportProductsDto) {
    return this.productsImportService.import(user, dto);
  }

  @Patch(":productId")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("productId") productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    const canViewCostPrice = await this.permissionsService.hasPermission(
      user.userId,
      user.role,
      Permission.VIEW_COST_PRICE,
    );
    const product = await this.productsService.update(user.businessId, productId, dto, canViewCostPrice);
    return canViewCostPrice ? product : redactCostPrice(product);
  }
}
