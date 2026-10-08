import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { StaffLoginDto } from "../users/dto/staff-login.dto";
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

  /** Managers may add employees, but only an owner may include a `login`. */
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(user.businessId, user.role, dto);
  }

  @Post(":employeeId/login")
  @Roles(Role.OWNER)
  createLogin(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
    @Body() dto: StaffLoginDto,
  ) {
    return this.employeesService.createLogin(user.businessId, employeeId, dto);
  }
}
