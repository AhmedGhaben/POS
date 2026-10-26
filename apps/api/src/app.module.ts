import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { TillThrottlerGuard } from "./common/guards/till-throttler.guard";
import { AuthModule } from "./auth/auth.module";
import { BusinessesModule } from "./businesses/businesses.module";
import { StoresModule } from "./stores/stores.module";
import { UsersModule } from "./users/users.module";
import { InvoicesModule } from "./invoices/invoices.module";
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
import { TransfersModule } from "./transfers/transfers.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { InsightsModule } from "./insights/insights.module";
import { HealthModule } from "./health/health.module";
import { TerminalsModule } from "./terminals/terminals.module";
import { DrawerEventsModule } from "./drawer-events/drawer-events.module";
import { ShiftsModule } from "./shifts/shifts.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { AccountantGuard } from "./common/guards/accountant.guard";
import { AuditLogInterceptor } from "./common/interceptors/audit-log.interceptor";
import { PermissionsModule } from "./common/permissions/permissions.module";
import { TillAuthModule } from "./till/till-auth.module";
import { OverridesModule } from "./overrides/overrides.module";
import { CompanyModule } from "./company/company.module";
import { FiscalModule } from "./fiscal/fiscal.module";
import { AccountsModule } from "./accounts/accounts.module";
import { AgtModule } from "./agt/agt.module";
import { AccountingModule } from "./accounting/accounting.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Global default: 100 req/min per IP (registered tills count per till,
    // see TillThrottlerGuard). Sensitive auth endpoints (login,
    // forgot-password, reset-password) set a stricter per-route limit.
    // Disabled under Jest (NODE_ENV=test by default) so e2e specs calling
    // /auth/login repeatedly don't have to manage a shared request budget.
    ThrottlerModule.forRoot({
      throttlers: [{ name: "default", ttl: 60_000, limit: 100 }],
      skipIf: () => process.env.NODE_ENV === "test",
    }),
    PrismaModule,
    PermissionsModule,
    OverridesModule,
    FiscalModule,
    AccountsModule,
    AgtModule,
    AccountingModule,
    CompanyModule,
    TillAuthModule,
    AuthModule,
    BusinessesModule,
    StoresModule,
    UsersModule,
    InvoicesModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    CustomersModule,
    SalesModule,
    TerminalsModule,
    DrawerEventsModule,
    ShiftsModule,
    SuppliersModule,
    EmployeesModule,
    PurchasesModule,
    ExpensesModule,
    ReturnsModule,
    ReportsModule,
    TransfersModule,
    NotificationsModule,
    InsightsModule,
    HealthModule,
  ],
  providers: [
    // Global order matters: throttle first (reject abusive traffic before
    // doing any auth work), then authenticate, then check @Roles() metadata,
    // then any @RequiresPermission() fine-grained check.
    { provide: APP_GUARD, useClass: TillThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: AccountantGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
