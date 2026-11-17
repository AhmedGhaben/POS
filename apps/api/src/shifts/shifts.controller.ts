import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OVERRIDE_HEADER } from "../overrides/overrides.service";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { TillUpload } from "../till/terminal-key.guard";
import { TillKey } from "../till/till-key.decorator";
import { TillAuthService } from "../till/till-auth.service";
import { CashMovementDto, CloseShiftDto, ListShiftsQuery, OpenShiftDto } from "./dto/shift.dto";
import { ShiftsService } from "./shifts.service";

/** Till shifts: opening float, cash in/out, cash count at close, report. */
@Controller("shifts")
export class ShiftsController {
  constructor(
    private readonly shifts: ShiftsService,
    private readonly tillAuth: TillAuthService,
  ) {}

  @Post("open")
  @TillUpload()
  @HttpCode(HttpStatus.OK)
  @UseGuards(StoreAccessGuard)
  async open(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenShiftDto, @TillKey() key: unknown) {
    // Online, a key that doesn't count is refused; an offline upload already happened.
    return this.shifts.open(user, dto, await this.tillAuth.tillFor(key, user.businessId, { rejectInvalid: !dto.offline }));
  }

  /** Cash in or out with a reason; cash out needs CASH_OUT or a manager's approval (checked in the service). */
  @Post("cash-movements")
  @TillUpload()
  @HttpCode(HttpStatus.OK)
  @UseGuards(StoreAccessGuard)
  async addMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CashMovementDto,
    @Headers(OVERRIDE_HEADER) overrideToken?: string,
    @TillKey() key?: unknown,
  ) {
    return this.shifts.addMovement(user, dto, overrideToken, await this.tillAuth.tillFor(key, user.businessId));
  }

  @Post("close")
  @TillUpload()
  @HttpCode(HttpStatus.OK)
  @UseGuards(StoreAccessGuard)
  async close(@CurrentUser() user: AuthenticatedUser, @Body() dto: CloseShiftDto, @TillKey() key: unknown) {
    return this.shifts.close(user, dto, await this.tillAuth.tillFor(key, user.businessId));
  }

  /** The open shift on a till (terminalId) or, without one, the caller's own: `{ shift }`, null when none. */
  @Get("current")
  @UseGuards(StoreAccessGuard)
  async current(
    @CurrentUser() user: AuthenticatedUser,
    @Query("storeId") storeId: string,
    @Query("terminalId") terminalId?: string,
    @TillKey() key?: unknown,
  ) {
    return { shift: await this.shifts.current(user, storeId, terminalId, await this.tillAuth.tillFor(key, user.businessId, { rejectInvalid: true })) };
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
