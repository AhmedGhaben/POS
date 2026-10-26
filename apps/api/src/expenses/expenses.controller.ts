import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CancelExpenseDto, CreateExpenseDto, UpdateExpenseDto } from "./dto/create-expense.dto";
import { ExpensesService } from "./expenses.service";

@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  /** `includeCancelled=true` adds cancelled expenses. */
  @Get("store/:storeId")
  @UseGuards(StoreAccessGuard)
  findByStore(@Param("storeId") storeId: string, @Query("includeCancelled") includeCancelled?: string) {
    return this.expensesService.findByStore(storeId, includeCancelled === "true");
  }

  @Post()
  @UseGuards(StoreAccessGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(user.userId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.update(user, id, dto);
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CancelExpenseDto) {
    return this.expensesService.cancel(user, id, dto.reason);
  }
}
