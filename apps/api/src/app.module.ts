import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { BusinessesModule } from "./businesses/businesses.module";
import { StoresModule } from "./stores/stores.module";
import { UsersModule } from "./users/users.module";
import { CategoriesModule } from "./categories/categories.module";
import { ProductsModule } from "./products/products.module";
import { InventoryModule } from "./inventory/inventory.module";
import { CustomersModule } from "./customers/customers.module";
import { SalesModule } from "./sales/sales.module";
import { SuppliersModule } from "./suppliers/suppliers.module";
import { EmployeesModule } from "./employees/employees.module";
import { PurchasesModule } from "./purchases/purchases.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { ReturnsModule } from "./returns/returns.module";
import { ReportsModule } from "./reports/reports.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    BusinessesModule,
    StoresModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    CustomersModule,
    SalesModule,
    SuppliersModule,
    EmployeesModule,
    PurchasesModule,
    ExpensesModule,
    ReturnsModule,
    ReportsModule,
  ],
  providers: [
    // Global order matters: authenticate first, then check @Roles() metadata.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
