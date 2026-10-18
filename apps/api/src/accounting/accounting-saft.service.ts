import { BadRequestException, Injectable } from "@nestjs/common";
import { PeriodStatus, Prisma } from "@prisma/client";
import { SaftExportService } from "../fiscal/saft-export.service";
import { PrismaService } from "../prisma/prisma.service";
import { IntegrationService } from "./integration.service";

export interface SaftIssue {
  code: "noTaxId" | "notKwanza" | "noYear" | "unposted" | "unbalanced" | "openPeriods" | "resultsNotWorkedOut" | "movementAccountWithSubAccounts";
  /** Blocks the export (open periods only without "draft"). */
  blocking: boolean;
  detail?: string;
}

/**
 * The SAF-T (AO) accounting file (step A8): the checks before it, and the
 * file itself (written by SaftExportService with the invoicing documents).
 */
@Injectable()
export class AccountingSaftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
    private readonly saft: SaftExportService,
  ) {}

  /** What stands between the books and the year's file; posts what's waiting first. */
  async check(businessId: string, userId: string, year: number, draft = false): Promise<{ year: number; ready: boolean; issues: SaftIssue[] }> {
    const issues: SaftIssue[] = [];
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const nif = business.taxId?.replace(/\s+/g, "") ?? "";
    if (nif.length < 10 || nif.length > 15) issues.push({ code: "noTaxId", blocking: true });
    if (business.currency !== "AOA") issues.push({ code: "notKwanza", blocking: true });
    const fy = await this.prisma.fiscalYear.findUnique({ where: { businessId_year: { businessId, year } } });
    if (!fy) {
      issues.push({ code: "noYear", blocking: true });
      return { year, ready: false, issues };
    }

    await this.integration.run(businessId, userId);
    const pending = await this.integration.pending(businessId, { from: `${year}-01-01`, to: `${year}-12-31` });
    if (pending.total > 0) issues.push({ code: "unposted", blocking: true, detail: String(pending.total) });

    const [totals] = await this.prisma.$queryRaw<{ debit: Prisma.Decimal | null; credit: Prisma.Decimal | null }[]>`
      SELECT SUM(l.debit) AS debit, SUM(l.credit) AS credit FROM "journal_entry_lines" l JOIN "journal_entries" e ON e.id = l."entryId"
      WHERE e."businessId" = ${businessId} AND e.year = ${year} AND e.period BETWEEN 1 AND 15`;
    const debit = new Prisma.Decimal(totals?.debit ?? 0);
    const credit = new Prisma.Decimal(totals?.credit ?? 0);
    if (!debit.eq(credit)) issues.push({ code: "unbalanced", blocking: true, detail: `${debit.toFixed(2)} / ${credit.toFixed(2)}` });

    const open = await this.prisma.accountingPeriod.findMany({ where: { businessId, year, number: { gte: 1, lte: 15 }, status: PeriodStatus.OPEN }, select: { number: true }, orderBy: { number: "asc" } });
    if (open.length) issues.push({ code: "openPeriods", blocking: !draft, detail: open.map((p) => p.number).join(", ") });

    const [left] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM (
        SELECT l."accountId" FROM "journal_entry_lines" l JOIN "journal_entries" e ON e.id = l."entryId" JOIN "ledger_accounts" a ON a.id = l."accountId"
        WHERE e."businessId" = ${businessId} AND e.year = ${year} AND a."classNo" IN (6, 7)
        GROUP BY l."accountId" HAVING SUM(l.debit) <> SUM(l.credit)) x`;
    if (Number(left.n) > 0) issues.push({ code: "resultsNotWorkedOut", blocking: false, detail: String(left.n) });

    const [wrong] = await this.prisma.$queryRaw<{ codes: string | null }[]>`
      SELECT string_agg(p.code, ', ') AS codes FROM "ledger_accounts" p
      WHERE p."businessId" = ${businessId} AND p.category = 'GM' AND EXISTS (SELECT 1 FROM "ledger_accounts" c WHERE c."parentId" = p.id)`;
    if (wrong?.codes) issues.push({ code: "movementAccountWithSubAccounts", blocking: true, detail: wrong.codes });

    return { year, ready: !issues.some((i) => i.blocking), issues };
  }

  /** The year's file, once the checks pass ("draft" lets a year with open periods through, for a trial run). */
  async export(businessId: string, userId: string, year: number, draft = false) {
    const { issues } = await this.check(businessId, userId, year, draft);
    const blocking = issues.filter((i) => i.blocking);
    if (blocking.length) {
      throw new BadRequestException(`The SAF-T accounting file can't be made yet: ${blocking.map((i) => (i.detail ? `${i.code} (${i.detail})` : i.code)).join("; ")}`);
    }
    return this.saft.contabilidade(businessId, userId, year);
  }
}
