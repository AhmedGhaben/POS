import { Controller, Get, NotFoundException, Param, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { ACCOUNTING_READ, ACCOUNTING_WRITE } from "./accounting-roles";
import { AccountingReportsService, isAccountingReport, ReportParams } from "./accounting-reports.service";
import { AccountingSaftService } from "./accounting-saft.service";

const int = (v?: string) => (v === undefined || v === "" ? undefined : Number(v));

/** The accounting reports (step A6): as tables, or ?format=xlsx for Excel; and the SAF-T accounting file (A8). */
@Controller("accounting")
@UseGuards(RolesGuard)
export class AccountingReportsController {
  constructor(
    private readonly reports: AccountingReportsService,
    private readonly saft: AccountingSaftService,
  ) {}

  /** What stands between the books and the year's SAF-T file. */
  @Get("saft/check")
  @Roles(...ACCOUNTING_WRITE)
  saftCheck(@CurrentUser() user: AuthenticatedUser, @Query("year") year: string, @Query("draft") draft?: string) {
    return this.saft.check(user.businessId, user.userId, Number(year), draft === "true");
  }

  /** SAF-T (AO) Contabilidade for a year (integrated with invoicing, "I"). */
  @Get("saft")
  @Roles(...ACCOUNTING_WRITE)
  async saftFile(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response, @Query("year") year: string, @Query("draft") draft?: string) {
    const file = await this.saft.export(user.businessId, user.userId, Number(year), draft === "true");
    res.set({
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Access-Control-Expose-Headers": "Content-Disposition",
      "Cache-Control": "no-store",
    });
    return new StreamableFile(Buffer.from(file.body as string, "utf8"));
  }

  @Get("reports/:report")
  @Roles(...ACCOUNTING_READ)
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Param("report") report: string,
    @Res({ passthrough: true }) res: Response,
    @Query() q: Record<string, string | undefined>,
  ) {
    if (!isAccountingReport(report)) throw new NotFoundException("Report not found");
    const params: ReportParams = {
      year: int(q.year),
      fromPeriod: int(q.fromPeriod),
      toPeriod: int(q.toPeriod),
      level: int(q.level),
      accountId: q.accountId || undefined,
      journalId: q.journalId || undefined,
      party: q.party === "supplier" ? "supplier" : q.party === "customer" ? "customer" : undefined,
      partyId: q.partyId || undefined,
    };
    if (q.format !== "xlsx") return this.reports.build(user.businessId, report, params);
    const file = await this.reports.xlsx(user.businessId, report, params);
    res.set({
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      "Access-Control-Expose-Headers": "Content-Disposition",
      "Cache-Control": "no-store",
    });
    return new StreamableFile(file.body);
  }
}
