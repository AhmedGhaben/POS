import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ACCOUNTING_READ, ACCOUNTING_WRITE } from "./accounting-roles";
import { CreateEntryDto, CreateJournalDto, ReverseEntryDto, UpdateJournalDto } from "./dto/accounting.dto";
import { EntriesService, serializeEntry } from "./entries.service";

const int = (v?: string) => (v === undefined || v === "" ? undefined : Number(v));

/** Journals and entries (docs/ACCOUNTING-DECISIONS.md, step A3). */
@Controller("accounting")
@UseGuards(RolesGuard)
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get("journals")
  @Roles(...ACCOUNTING_READ)
  journals(@CurrentUser() user: AuthenticatedUser) {
    return this.entries.journals(user.businessId);
  }

  @Post("journals")
  @Roles(...ACCOUNTING_WRITE)
  createJournal(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateJournalDto) {
    return this.entries.createJournal(user.businessId, dto);
  }

  @Patch("journals/:id")
  @Roles(...ACCOUNTING_WRITE)
  updateJournal(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateJournalDto) {
    return this.entries.updateJournal(user.businessId, id, dto);
  }

  @Get("entries")
  @Roles(...ACCOUNTING_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("year") year?: string,
    @Query("period") period?: string,
    @Query("journalId") journalId?: string,
    @Query("accountId") accountId?: string,
    @Query("origin") origin?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("search") search?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    return this.entries.list(user.businessId, { year: int(year), period: int(period), journalId, accountId, origin, from, to, search, take: int(take), skip: int(skip) });
  }

  @Get("entries/:id")
  @Roles(...ACCOUNTING_READ)
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return serializeEntry(await this.entries.get(user.businessId, id));
  }

  /** A manual entry: balanced, in an open period; immutable once saved. */
  @Post("entries")
  @Roles(...ACCOUNTING_WRITE)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEntryDto) {
    const entry = await this.entries.post({ ...dto, businessId: user.businessId, sourceUserId: user.userId, origin: "MANUAL" });
    return serializeEntry(entry);
  }

  /** Corrects an entry with its estorno (the lines swapped). */
  @Post("entries/:id/reverse")
  @HttpCode(201)
  @Roles(...ACCOUNTING_WRITE)
  async reverse(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ReverseEntryDto) {
    return serializeEntry(await this.entries.reverse(user.businessId, user.userId, id, dto));
  }
}
