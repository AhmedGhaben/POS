import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CustomersService } from "./customers.service";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query("search") search?: string) {
    return this.customersService.findAll(user.businessId, search);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user.businessId, dto);
  }
}
