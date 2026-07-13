import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { EmployeesService } from "./employees.service";

@Controller("employees")
@UseGuards(RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.findAll(user.businessId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(user.businessId, dto);
  }
}
