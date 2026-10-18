import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { JournalKind, PeriodStatus, Prisma, TransactionType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EntriesService } from "./entries.service";
import { LineInput } from "./entry-rules";
import { IntegrationService } from "./integration.service";
import { NET_RESULT_PERIOD, OPENING_PERIOD, RESULTS_PERIOD } from "./periods";
import { PeriodsService } from "./periods.service";
import { carriedForward, closesIntoNetResult, resultAccountFor, zeroingLines } from "./year-end";

const ZERO = new Prisma.Decimal(0);

/**
 * Year-end (step A7): the apuramento de resultados, closing the year with
 * its balances carried into the next one's opening, and reopening it.
 */
@Injectable()
export class YearEndService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entries: EntriesService,
    private readonly periods: PeriodsService,
    private readonly integration: IntegrationService,
  ) {}

  /** Each movement account's balance (debit − credit) over the whole year. */
  private async balances(businessId: string, year: number) {
    const rows = await this.prisma.$queryRaw<{ accountId: string; code: string; balance: Prisma.Decimal }[]>`
      SELECT l."accountId", a.code, SUM(l.debit) - SUM(l.credit) AS balance
      FROM "journal_entry_lines" l JOIN "journal_entries" e ON e.id = l."entryId" JOIN "ledger_accounts" a ON a.id = l."accountId"
      WHERE e."businessId" = ${businessId} AND e.year = ${year}
      GROUP BY l."accountId", a.code`;
    return rows.map((r) => ({ accountId: r.accountId, code: r.code, balance: new Prisma.Decimal(r.balance) }));
  }

  private async account(businessId: string, code: string) {
    const a = await this.prisma.ledgerAccount.findUnique({ where: { businessId_code: { businessId, code } } });
    if (!a) throw new BadRequestException(`Account ${code} is missing from the chart: open it to work out the results`);
    return a;
  }

  private async year(businessId: string, year: number) {
    const y = await this.prisma.fiscalYear.findUnique({ where: { businessId_year: { businessId, year } } });
    if (!y) throw new NotFoundException("Accounting period not found");
    return y;
  }

  /** The apuramento entries of a year that haven't been reversed. */
  private async resultEntries(businessId: string, year: number) {
    return this.prisma.journalEntry.findMany({ where: { businessId, year, origin: "YEAR_END", reversedBy: { is: null }, reversesEntryId: null } });
  }

  /**
   * Apuramento de resultados (type A, journal APU, 31 December): period 14
   * closes classes 6 and 7 into 82-86; period 15 closes 82-87 into 88.
   * Everything of the year must be posted first.
   */
  async workOutResults(businessId: string, userId: string, year: number) {
    const fy = await this.year(businessId, year);
    if (fy.status !== PeriodStatus.OPEN) throw new BadRequestException(`The year ${year} is closed: nothing can be posted in it`);
    if ((await this.resultEntries(businessId, year)).length) throw new ConflictException(`The results of ${year} were already worked out: reverse those entries to do it again`);
    await this.integration.run(businessId, userId);
    const { total } = await this.integration.pending(businessId, { from: `${year}-01-01`, to: `${year}-12-31` });
    if (total > 0) throw new BadRequestException(`${total} records of this period aren't posted yet: see the integration monitor`);

    const journal = await this.entries.systemJournal(this.prisma, businessId, JournalKind.CLOSING);
    const date = `${year}-12-31`;
    return this.prisma.$transaction(
      async (tx) => {
        const created: string[] = [];
        // Step 1: classes 6 and 7 into 82-86.
        const byResult = new Map<string, { accountId: string; balance: Prisma.Decimal }[]>();
        for (const b of await this.balances(businessId, year)) {
          const target = resultAccountFor(b.code);
          if (target && !b.balance.isZero()) byResult.set(target, [...(byResult.get(target) ?? []), b]);
        }
        if (byResult.size) {
          const lines: LineInput[] = [];
          for (const [code, accounts] of byResult) {
            const { lines: zeroing, net } = zeroingLines(accounts);
            lines.push(...zeroing.map((l) => ({ ...l, description: `Apuramento – ${code}` })));
            const target = await this.account(businessId, code);
            if (!net.isZero()) lines.push(net.gt(0) ? { accountId: target.id, debit: net } : { accountId: target.id, credit: net.negated() });
          }
          const e = await this.entries.post(
            { businessId, journalId: journal.id, transactionDate: date, postingDate: date, period: RESULTS_PERIOD, description: `Apuramento de resultados ${year}`, transactionType: TransactionType.A, sourceUserId: userId, origin: "YEAR_END", lines },
            tx,
          );
          created.push(e.id);
        }
        // Step 2: 82-87 into 88.
        const step2 = (await this.balancesIn(tx, businessId, year)).filter((b) => closesIntoNetResult(b.code) && !b.balance.isZero());
        if (step2.length) {
          const { lines, net } = zeroingLines(step2);
          const netResult = await this.account(businessId, "88.1");
          if (!net.isZero()) lines.push(net.gt(0) ? { accountId: netResult.id, debit: net } : { accountId: netResult.id, credit: net.negated() });
          const e = await this.entries.post(
            { businessId, journalId: journal.id, transactionDate: date, postingDate: date, period: NET_RESULT_PERIOD, description: `Resultado líquido do exercício ${year}`, transactionType: TransactionType.A, sourceUserId: userId, origin: "YEAR_END", lines },
            tx,
          );
          created.push(e.id);
        }
        if (!created.length) throw new BadRequestException(`There's nothing in classes 6 and 7 for ${year}`);
        await tx.auditLog.create({ data: { businessId, userId, action: "ACCOUNTING_RESULTS_WORKED_OUT", entityType: "Accounting", metadata: { year, entries: created } } });
        return { entries: created };
      },
      { timeout: 120_000 },
    );
  }

  /** Balances inside a transaction (after step 1 was posted in it). */
  private async balancesIn(tx: Prisma.TransactionClient, businessId: string, year: number) {
    const rows = await tx.$queryRaw<{ accountId: string; code: string; balance: Prisma.Decimal }[]>`
      SELECT l."accountId", a.code, SUM(l.debit) - SUM(l.credit) AS balance
      FROM "journal_entry_lines" l JOIN "journal_entries" e ON e.id = l."entryId" JOIN "ledger_accounts" a ON a.id = l."accountId"
      WHERE e."businessId" = ${businessId} AND e.year = ${year}
      GROUP BY l."accountId", a.code`;
    return rows.map((r) => ({ accountId: r.accountId, code: r.code, balance: new Prisma.Decimal(r.balance) }));
  }

  /**
   * Closes the year: the months must be closed and the results worked out
   * (classes 6 and 7 at zero). The balances of classes 1-5 and 8 open the
   * next year (journal Abertura, period 0, 1 January); every period of the
   * year is closed with it.
   */
  async close(businessId: string, userId: string, year: number) {
    const fy = await this.year(businessId, year);
    if (fy.status === PeriodStatus.CLOSED) return this.periods.list(businessId);
    const open = await this.prisma.accountingPeriod.findMany({ where: { businessId, year, number: { gte: 1, lte: 12 }, status: PeriodStatus.OPEN }, select: { number: true } });
    if (open.length) throw new BadRequestException(`Close the months first: ${open.map((p) => p.number).join(", ")} still open`);
    const balances = await this.balances(businessId, year);
    if (balances.some((b) => !carriedForward(b.code) && !b.balance.isZero())) throw new BadRequestException("Work out the results first: classes 6 and 7 still have balances");
    const next = year + 1;
    await this.periods.ensureYear(null, businessId, next);
    const journal = await this.entries.systemJournal(this.prisma, businessId, JournalKind.OPENING);
    await this.prisma.$transaction(
      async (tx) => {
        const lines: LineInput[] = balances
          .filter((b) => carriedForward(b.code) && !b.balance.isZero())
          .map((b) => (b.balance.gt(0) ? { accountId: b.accountId, debit: b.balance } : { accountId: b.accountId, credit: b.balance.negated() }));
        if (lines.length) {
          await this.entries.post(
            {
              businessId,
              journalId: journal.id,
              transactionDate: `${next}-01-01`,
              postingDate: `${next}-01-01`,
              period: OPENING_PERIOD,
              description: `Abertura ${next}: saldos transportados de ${year}`,
              sourceUserId: userId,
              origin: "CARRY_FORWARD",
              lines: lines.map((l) => ({ ...l, description: `Saldo transportado de ${year}` })),
            },
            tx,
          );
        }
        const now = new Date();
        await tx.accountingPeriod.updateMany({ where: { businessId, year, status: PeriodStatus.OPEN }, data: { status: PeriodStatus.CLOSED, closedAt: now, closedById: userId } });
        await tx.fiscalYear.update({ where: { id: fy.id }, data: { status: PeriodStatus.CLOSED, closedAt: now, closedById: userId } });
        await tx.auditLog.create({ data: { businessId, userId, action: "ACCOUNTING_YEAR_CLOSED", entityType: "Accounting", metadata: { year, carriedForward: lines.length } } });
      },
      { timeout: 120_000 },
    );
    return this.periods.list(businessId);
  }

  /**
   * Opens a closed year again (owner or accountant, with a reason, in the
   * audit log): the opening it carried into the next year is reversed, so
   * closing again carries the corrected balances.
   */
  async reopen(businessId: string, userId: string, year: number, reason: string) {
    const fy = await this.year(businessId, year);
    if (fy.status === PeriodStatus.OPEN) return this.periods.list(businessId);
    const next = await this.prisma.fiscalYear.findUnique({ where: { businessId_year: { businessId, year: year + 1 } } });
    if (next?.status === PeriodStatus.CLOSED) throw new BadRequestException(`Reopen ${year + 1} first`);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.fiscalYear.update({ where: { id: fy.id }, data: { status: PeriodStatus.OPEN, closedAt: null, closedById: null } });
        await tx.accountingPeriod.updateMany({ where: { businessId, year, number: { gte: 13 } }, data: { status: PeriodStatus.OPEN, closedAt: null, closedById: null } });
        const carried = await tx.journalEntry.findFirst({ where: { businessId, year: year + 1, origin: "CARRY_FORWARD", reversedBy: { is: null }, reversesEntryId: null } });
        if (carried) {
          // Period 0 of the next year must take the reversal.
          await tx.accountingPeriod.updateMany({ where: { businessId, year: year + 1, number: OPENING_PERIOD }, data: { status: PeriodStatus.OPEN, closedAt: null, closedById: null } });
          await this.entries.reverse(businessId, userId, carried.id, { description: `Reabertura de ${year}: ${reason.trim()}`.slice(0, 200) }, tx);
        }
        await tx.auditLog.create({ data: { businessId, userId, action: "ACCOUNTING_YEAR_REOPENED", entityType: "Accounting", metadata: { year, reason: reason.trim(), reversedCarryForward: carried?.id ?? null } } });
      },
      { timeout: 120_000 },
    );
    return this.periods.list(businessId);
  }

  /** What the year-end screen shows: results done, balances of 6/7 left, months still open. */
  async state(businessId: string, year: number) {
    const fy = await this.year(businessId, year);
    const balances = await this.balances(businessId, year);
    const left = balances.filter((b) => !carriedForward(b.code)).reduce((s, b) => s.plus(b.balance.abs()), ZERO);
    const openMonths = await this.prisma.accountingPeriod.count({ where: { businessId, year, number: { gte: 1, lte: 12 }, status: PeriodStatus.OPEN } });
    return { year, status: fy.status, resultsDone: (await this.resultEntries(businessId, year)).length > 0, incomeAndCostsLeft: left.toFixed(2), openMonths };
  }
}
