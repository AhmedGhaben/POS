import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ACCOUNTING_READ, ACCOUNTING_WRITE } from "./accounting-roles";
import { CreateEntryDto, CreateJournalDto, EntryTemplateDto, OpeningBalancesDto, ReverseEntryDto, UpdateJournalDto } from "./dto/accounting.dto";
import { TemplatesService } from "./templates.service";
import { EntriesService, serializeEntry } from "./entries.service";

const int = (v?: string) => (v === undefined || v === "" ? undefined : Number(v));

/** Journals and entries (docs/ACCOUNTING-DECISIONS.md, step A3). */
@Controller("accounting")
@UseGuards(RolesGuard)
export class EntriesController {
  constructor(
    private readonly entries: EntriesService,
    private readonly templates: TemplatesService,
  ) {}

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

  @Get("templates")
  @Roles(...ACCOUNTING_READ)
  templateList(@CurrentUser() user: AuthenticatedUser) {
    return this.templates.list(user.businessId);
  }

  @Post("templates")
  @Roles(...ACCOUNTING_WRITE)
  createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() dto: EntryTemplateDto) {
    return this.templates.save(user.businessId, null, dto);
  }

  @Put("templates/:id")
  @Roles(...ACCOUNTING_WRITE)
  updateTemplate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: EntryTemplateDto) {
    return this.templates.save(user.businessId, id, dto);
  }

  @Delete("templates/:id")
  @Roles(...ACCOUNTING_WRITE)
  removeTemplate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.templates.remove(user.businessId, id);
  }

  /** Opening balances for a year (period 0, journal Abertura). */
  @Post("opening")
  @Roles(...ACCOUNTING_WRITE)
  async opening(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpeningBalancesDto) {
    return serializeEntry(await this.templates.opening(user.businessId, user.userId, dto.year, dto.lines));
  }
}
