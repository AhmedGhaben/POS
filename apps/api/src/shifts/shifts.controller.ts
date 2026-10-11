import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Permission, Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequiresPermission } from "../common/decorators/requires-permission.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { TillUpload } from "../till/terminal-key.guard";
import { CashMovementDto, CloseShiftDto, ListShiftsQuery, OpenShiftDto } from "./dto/shift.dto";
import { ShiftsService } from "./shifts.service";

/** Till shifts: opening float, cash in/out, cash count at close, report. */
@Controller("shifts")
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Post("open")
  @TillUpload()
  @HttpCode(HttpStatus.OK)
  @UseGuards(StoreAccessGuard)
  open(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenShiftDto) {
    return this.shifts.open(user, dto);
  }

  /** Opens the drawer without a sale, so it needs OPEN_DRAWER. */
  @Post("cash-movements")
  @TillUpload()
  @HttpCode(HttpStatus.OK)
  @UseGuards(StoreAccessGuard)
  @RequiresPermission(Permission.OPEN_DRAWER)
  addMovement(@CurrentUser() user: AuthenticatedUser, @Body() dto: CashMovementDto) {
    return this.shifts.addMovement(user, dto);
  }

  @Post("close")
  @TillUpload()
  @HttpCode(HttpStatus.OK)
  @UseGuards(StoreAccessGuard)
  close(@CurrentUser() user: AuthenticatedUser, @Body() dto: CloseShiftDto) {
    return this.shifts.close(user, dto);
  }

  /** The open shift on a till (terminalId) or, without one, the caller's own: `{ shift }`, null when none. */
  @Get("current")
  @UseGuards(StoreAccessGuard)
  async current(
    @CurrentUser() user: AuthenticatedUser,
    @Query("storeId") storeId: string,
    @Query("terminalId") terminalId?: string,
  ) {
    return { shift: await this.shifts.current(user, storeId, terminalId) };
  }

  /** A shift by the till's own id (the till prints the server's report after closing). */
  @Get("client/:clientId")
  @UseGuards(StoreAccessGuard)
  findByClient(
    @CurrentUser() user: AuthenticatedUser,
    @Query("storeId") storeId: string,
    @Param("clientId") clientId: string,
  ) {
    return this.shifts.findByClient(user, storeId, clientId);
  }

  @Get()
  @UseGuards(RolesGuard, StoreAccessGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListShiftsQuery) {
    return this.shifts.findAll(user, query);
  }

  @Get(":shiftId")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("shiftId") id: string) {
    return this.shifts.findOne(user, id);
  }
}
