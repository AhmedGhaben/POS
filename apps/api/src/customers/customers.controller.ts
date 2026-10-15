import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateCustomerDto, UpdateCustomerDto } from "./dto/create-customer.dto";
import { CustomersService } from "./customers.service";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /** `withBalance=true` adds what each owes on credit (the Customers page). */
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query("search") search?: string, @Query("withBalance") withBalance?: string) {
    return this.customersService.findAll(user.businessId, search, withBalance === "true");
  }

  /** The customer card: details, what they've bought, their last sales and their account. */
  @Get(":id/card")
  card(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.customersService.card(user.businessId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(user, id, dto);
  }
}
