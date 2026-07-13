import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { ExpensesService } from "./expenses.service";

@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get("store/:storeId")
  @UseGuards(StoreAccessGuard)
  findByStore(@Param("storeId") storeId: string) {
    return this.expensesService.findByStore(storeId);
  }

  @Post()
  @UseGuards(StoreAccessGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(user.userId, dto);
  }
}
