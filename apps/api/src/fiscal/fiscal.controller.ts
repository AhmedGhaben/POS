import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { StoreAccessGuard } from "../common/guards/store-access.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateProformaDto } from "./dto/create-proforma.dto";
import { RecordPrintDto } from "./dto/record-print.dto";
import { Public } from "../common/decorators/public.decorator";
import { CurrentTerminal, TerminalKeyGuard } from "../till/terminal-key.guard";
import type { TillTerminal } from "../till/till-auth.service";
import { FiscalService } from "./fiscal.service";
import { ExportFile, SaftExportService } from "./saft-export.service";

/**
 * Fiscal documents: read and print them. There's no route to change or
 * delete one (the database refuses too); an FR is annulled by cancelling
 * its sale, and corrected with a credit note (a return).
 */
@Controller("fiscal-documents")
export class FiscalController {
  constructor(
    private readonly fiscal: FiscalService,
    private readonly saftExport: SaftExportService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("storeId") storeId?: string,
    @Query("type") type?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("search") search?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    const [items, total] = await this.fiscal.list(user.businessId, {
      storeId,
      type,
      from,
      to,
      search,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
    return { items, total };
  }

  /**
   * The signing key, for a registered till only: asked with the till's key
   * (X-Terminal-Key) by the Windows app's main process, never by a page.
   */
  @Public()
  @UseGuards(TerminalKeyGuard)
  @Get("signing-key")
  signingKey(@CurrentTerminal() terminal: TillTerminal) {
    return this.fiscal.signingKeyFor(terminal);
  }

  /** Breaks in a hash chain (a signature that doesn't match, a missing or re-ordered document). */
  @Get("alerts")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  alerts(@CurrentUser() user: AuthenticatedUser, @Query("all") all?: string) {
    return this.fiscal.alerts(user.businessId, all === "true");
  }

  @Post("alerts/:id/resolve")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  resolveAlert(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.fiscal.resolveAlert(user.businessId, id, user.userId);
  }

  /** A till's series and next numbers (it numbers its own documents, offline too). */
  @Get("series/till/:terminalId")
  tillSeries(@CurrentUser() user: AuthenticatedUser, @Param("terminalId") terminalId: string) {
    return this.fiscal.tillSeries(user.businessId, terminalId);
  }

  @Post("proformas")
  @UseGuards(StoreAccessGuard)
  createProforma(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProformaDto) {
    return this.fiscal.createProforma(user.businessId, user.userId, dto);
  }

  /**
   * SAF-T (AO) Facturação for a period: startDate and endDate are calendar
   * dates (YYYY-MM-DD) in the store's time zone; neither = last month.
   */
  @Get("saft/facturacao")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async saftFacturacao(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Query("storeId") storeId?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return sendFile(res, await this.saftExport.facturacao(user.businessId, user.userId, { storeId, startDate, endDate }));
  }

  /** SAF-T (AO) Aquisição de Bens e Serviços for a period (same dates as the invoicing file; neither = last month). */
  @Get("saft/aquisicao")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async saftAquisicao(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Query("storeId") storeId?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return sendFile(res, await this.saftExport.aquisicao(user.businessId, user.userId, { storeId, startDate, endDate }));
  }

  /** SAF-T de Inventários (draft format): stock at the end of `date` (default: last 31 December). */
  @Get("saft/inventario")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async saftInventario(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Query("storeId") storeId?: string,
    @Query("date") date?: string,
  ) {
    return sendFile(res, await this.saftExport.inventario(user.businessId, user.userId, { storeId, date }));
  }

  /** The accountant's Excel workbook for a period (same dates as the SAF-T file). */
  @Get("accountant-export")
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async accountantExport(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Query("storeId") storeId?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return sendFile(res, await this.saftExport.accountant(user.businessId, user.userId, { storeId, startDate, endDate }));
  }

  /** About to print a document: logged; the answer says whether it's a "2ª Via". */
  @Post(":id/prints")
  recordPrint(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RecordPrintDto) {
    return this.fiscal.recordPrint(user.businessId, user.userId, id, dto.kind, dto.copies);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.fiscal.get(user.businessId, id);
  }
}

/** A generated file as a download; the web app reads the name from Content-Disposition. */
function sendFile(res: Response, file: ExportFile) {
  res.set({
    "Content-Type": file.mimeType,
    "Content-Disposition": `attachment; filename="${file.fileName}"`,
    "Access-Control-Expose-Headers": "Content-Disposition",
    "Cache-Control": "no-store",
  });
  return new StreamableFile(typeof file.body === "string" ? Buffer.from(file.body, "utf8") : file.body);
}
