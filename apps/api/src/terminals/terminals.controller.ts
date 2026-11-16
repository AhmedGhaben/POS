import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { CurrentTerminal, TerminalKeyGuard } from "../till/terminal-key.guard";
import type { TillTerminal } from "../till/till-auth.service";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { Throttle } from "@nestjs/throttler";
import { CreatePairingCodeDto, CreateTerminalDto, PairTerminalDto, TerminalHeartbeatDto, UpdateTerminalDto } from "./dto/terminal.dto";
import { TerminalStatusService } from "./terminal-status.service";
import { TerminalsService } from "./terminals.service";

/** Physical tills running the desktop app. Setting one up needs a manager. */
@Controller("terminals")
export class TerminalsController {
  constructor(
    private readonly terminalsService: TerminalsService,
    private readonly statusService: TerminalStatusService,
  ) {}

  @Post()
  @UseGuards(RolesGuard, StoreAccessGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTerminalDto) {
    return this.terminalsService.create(user.businessId, dto);
  }

  /** A code for setting up a new till without a password (10 minutes, single use). */
  @Post("pairing-codes")
  @UseGuards(RolesGuard, StoreAccessGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  createPairingCode(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePairingCodeDto) {
    return this.terminalsService.createPairingCode(user, dto);
  }

  /** The new till types its code: nobody is signed in there yet. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("pair")
  pair(@Body() dto: PairTerminalDto) {
    return this.terminalsService.pair(dto.code);
  }

  @Get()
  @UseGuards(RolesGuard, StoreAccessGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query("storeId") storeId?: string) {
    return this.terminalsService.findAll(user, storeId);
  }

  /** The till's PIN sign-in list (till key, nobody signed in). */
  @Public()
  @UseGuards(TerminalKeyGuard)
  @Get("me/staff")
  staff(@CurrentTerminal() terminal: TillTerminal) {
    return this.terminalsService.staffForTill(terminal);
  }

  /**
   * The till's heartbeat ("Lojas agora"): its queue size and version, every
   * minute while it's online. Till key, nobody need be signed in. The till
   * sends it fire-and-forget; selling never waits for it.
   */
  @Public()
  @UseGuards(TerminalKeyGuard)
  @Post("me/heartbeat")
  @HttpCode(204)
  async heartbeat(@CurrentTerminal() terminal: TillTerminal, @Body() dto: TerminalHeartbeatDto): Promise<void> {
    await this.statusService.heartbeat(terminal, dto);
  }

  /** A new key for the till (the old one stops working). */
  @Post(":terminalId/key")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  rotateKey(@CurrentUser() user: AuthenticatedUser, @Param("terminalId") id: string) {
    return this.terminalsService.rotateKey(user, id);
  }

  /** Any signed-in user of the business: the till shows its own name. */
  @Get(":terminalId")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("terminalId") id: string) {
    return this.terminalsService.findOne(user.businessId, id);
  }

  @Patch(":terminalId")
  @UseGuards(RolesGuard, StoreAccessGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("terminalId") id: string,
    @Body() dto: UpdateTerminalDto,
  ) {
    return this.terminalsService.update(user, id, dto);
  }
}
