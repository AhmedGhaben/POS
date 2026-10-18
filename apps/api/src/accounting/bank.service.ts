import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { JournalKind, LedgerAccountCategory, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { dateValue, isoDate } from "./accounting-dates";
import { bestMatch, ColumnMapping, mapStatement, readCsv, readXlsx, Table } from "./bank-import";
import { EntriesService } from "./entries.service";

/**
 * Bank reconciliation (docs/ACCOUNTING-DECISIONS.md, B3): import a
 * statement, match its movements with the bank account's postings
 * (automatically: same amount within three days; or by hand), and post
 * what's only on the statement (fees, interest) as new entries.
 */
@Injectable()
export class BankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entries: EntriesService,
  ) {}

  /** A statement file (CSV or Excel, as a data: URL) as a table, for the person to say which column is what. */
  parse(input: { fileName: string; dataUrl: string }): { rows: Table } {
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(input.dataUrl);
    if (!m) throw new BadRequestException("Send the statement as a CSV or Excel file");
    const data = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
    if (data.length > 5 * 1024 * 1024) throw new BadRequestException("Files are 5 MB at most");
    try {
      const rows = /\.xlsx$/i.test(input.fileName) || data.subarray(0, 2).toString("latin1") === "PK" ? readXlsx(data) : readCsv(data.toString("utf8"));
      return { rows: rows.slice(0, 5000) };
    } catch {
      throw new BadRequestException("The file can't be read: save the statement as CSV or Excel (.xlsx)");
    }
  }

  private async bankAccount(businessId: string, accountId: string) {
    const account = await this.prisma.ledgerAccount.findFirst({ where: { id: accountId, businessId } });
    if (!account) throw new NotFoundException("Account not found");
    if (account.category !== LedgerAccountCategory.GM || account.classNo !== 4) throw new BadRequestException("Choose a bank or cash movement account (class 4)");
    return account;
  }

  /** Stores the statement's movements by the column mapping, then matches what it can. */
  async import(businessId: string, userId: string, input: { accountId: string; fileName: string; rows: Table; mapping: ColumnMapping }) {
    await this.bankAccount(businessId, input.accountId);
    const { rows, skipped } = mapStatement(input.rows, input.mapping);
    if (!rows.length) throw new BadRequestException("No movements found: check which columns are the date and the amount");
    const dates = rows.map((r) => r.date).sort();
    const statement = await this.prisma.bankStatement.create({
      data: {
        businessId,
        accountId: input.accountId,
        fileName: input.fileName.slice(0, 120),
        periodFrom: dateValue(dates[0]),
        periodTo: dateValue(dates[dates.length - 1]),
        importedById: userId,
        lines: { create: rows.map((r) => ({ businessId, date: dateValue(r.date), description: r.description, reference: r.reference, amount: r.amount })) },
      },
    });
    const matched = await this.autoMatch(businessId, statement.id);
    return { id: statement.id, lines: rows.length, skippedRows: skipped, matched };
  }

  /** Ledger lines on the account not yet matched with any statement line, as signed amounts (debit = money in). */
  private async openLedgerLines(businessId: string, accountId: string, from: string, to: string) {
    const lines = await this.prisma.journalEntryLine.findMany({
      where: { accountId, entry: { businessId, postingDate: { gte: dateValue(from), lte: dateValue(to) } } },
      include: { entry: { select: { postingDate: true, transactionId: true, description: true } } },
    });
    const taken = new Set(
      (await this.prisma.bankStatementLine.findMany({ where: { businessId, matchedLineId: { in: lines.map((l) => l.id) } }, select: { matchedLineId: true } })).map((l) => l.matchedLineId),
    );
    return lines
      .filter((l) => !taken.has(l.id))
      .map((l) => ({ id: l.id, date: isoDate(l.entry.postingDate), amount: l.debit.minus(l.credit), transactionId: l.entry.transactionId, description: l.description }));
  }

  private shift(date: string, days: number) {
    return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  }

  /** Same amount, closest date within three days, one ledger line per statement line. */
  async autoMatch(businessId: string, statementId: string): Promise<number> {
    const statement = await this.statement(businessId, statementId);
    const open = await this.openLedgerLines(businessId, statement.accountId, this.shift(isoDate(statement.periodFrom), -3), this.shift(isoDate(statement.periodTo), 3));
    let matched = 0;
    for (const line of statement.lines.filter((l) => !l.matchedLineId)) {
      const hit = bestMatch({ date: isoDate(line.date), amount: line.amount }, open);
      if (!hit) continue;
      open.splice(open.indexOf(hit), 1);
      await this.prisma.bankStatementLine.update({ where: { id: line.id }, data: { matchedLineId: hit.id, matchKind: "AUTO" } });
      matched++;
    }
    return matched;
  }

  private async statement(businessId: string, id: string) {
    const s = await this.prisma.bankStatement.findFirst({ where: { id, businessId }, include: { lines: { orderBy: [{ date: "asc" }, { id: "asc" }] } } });
    if (!s) throw new NotFoundException("Bank statement not found");
    return s;
  }

  list(businessId: string) {
    return this.prisma.bankStatement.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { lines: true } } },
    });
  }

  /**
   * A statement with each movement's state (matched, posted, open) and the
   * ledger lines on the account over its dates that no statement line
   * explains (in the books, not at the bank yet).
   */
  async get(businessId: string, id: string) {
    const s = await this.statement(businessId, id);
    const matchedIds = s.lines.map((l) => l.matchedLineId).filter((x): x is string => !!x);
    const ledger = await this.prisma.journalEntryLine.findMany({ where: { id: { in: matchedIds } }, include: { entry: { select: { transactionId: true, postingDate: true } } } });
    const byId = new Map(ledger.map((l) => [l.id, l]));
    // Over the statement's dates, give or take the three days a matching movement may be off by.
    const unexplained = await this.openLedgerLines(businessId, s.accountId, this.shift(isoDate(s.periodFrom), -3), this.shift(isoDate(s.periodTo), 3));
    const account = await this.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: s.accountId }, select: { id: true, code: true, name: true } });
    const total = (f: (l: (typeof s.lines)[number]) => boolean) => s.lines.filter(f).reduce((sum, l) => sum.plus(l.amount), new Prisma.Decimal(0)).toFixed(2);
    return {
      id: s.id,
      account,
      fileName: s.fileName,
      periodFrom: isoDate(s.periodFrom),
      periodTo: isoDate(s.periodTo),
      totals: { statement: total(() => true), matched: total((l) => !!l.matchedLineId), open: total((l) => !l.matchedLineId) },
      lines: s.lines.map((l) => {
        const m = l.matchedLineId ? byId.get(l.matchedLineId) : undefined;
        return {
          id: l.id,
          date: isoDate(l.date),
          description: l.description,
          reference: l.reference,
          amount: l.amount.toFixed(2),
          matchKind: l.matchKind,
          matched: m ? { lineId: m.id, transactionId: m.entry.transactionId, date: isoDate(m.entry.postingDate) } : null,
        };
      }),
      unexplained: unexplained.map((u) => ({ lineId: u.id, date: u.date, transactionId: u.transactionId, description: u.description, amount: u.amount.toFixed(2) })),
    };
  }

  /** Matches a statement movement with a ledger line by hand (same account and amount). */
  async match(businessId: string, lineId: string, ledgerLineId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, businessId }, include: { statement: true } });
    if (!line) throw new NotFoundException("Bank statement line not found");
    if (line.matchedLineId) throw new ConflictException("This movement is already matched");
    const ledger = await this.prisma.journalEntryLine.findFirst({ where: { id: ledgerLineId, accountId: line.statement.accountId, entry: { businessId } } });
    if (!ledger) throw new NotFoundException("Entry line not found");
    if (!ledger.debit.minus(ledger.credit).eq(line.amount)) throw new BadRequestException("The amounts differ");
    try {
      await this.prisma.bankStatementLine.update({ where: { id: line.id }, data: { matchedLineId: ledger.id, matchKind: "MANUAL" } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("That entry line is already matched with another movement");
      throw error;
    }
    return { matched: true };
  }

  async unmatch(businessId: string, lineId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, businessId } });
    if (!line) throw new NotFoundException("Bank statement line not found");
    if (line.matchKind === "POSTED") throw new BadRequestException("It was posted from here: reverse that entry instead");
    await this.prisma.bankStatementLine.update({ where: { id: line.id }, data: { matchedLineId: null, matchKind: null } });
    return { matched: false };
  }

  /**
   * Posts a movement that's only on the statement (bank fees, interest) in
   * the Bancos journal, against the account chosen, and matches it.
   */
  async post(businessId: string, userId: string, lineId: string, input: { accountId: string; description?: string }) {
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, businessId }, include: { statement: true } });
    if (!line) throw new NotFoundException("Bank statement line not found");
    if (line.matchedLineId) throw new ConflictException("This movement is already matched");
    const bank = line.statement.accountId;
    const amount = line.amount.abs();
    const incoming = line.amount.gt(0);
    return this.prisma.$transaction(async (tx) => {
      const journal = await this.entries.systemJournal(tx, businessId, JournalKind.BANK);
      const date = isoDate(line.date);
      const entry = await this.entries.post(
        {
          businessId,
          journalId: journal.id,
          transactionDate: date,
          postingDate: date,
          description: input.description?.trim() || line.description,
          sourceUserId: userId,
          origin: "BANK",
          lines: [
            { accountId: incoming ? bank : input.accountId, debit: amount, description: line.description, sourceDocumentId: line.reference },
            { accountId: incoming ? input.accountId : bank, credit: amount, description: line.description, sourceDocumentId: line.reference },
          ],
        },
        tx,
      );
      const bankLine = entry.lines.find((l) => l.accountId === bank)!;
      await tx.bankStatementLine.update({ where: { id: line.id }, data: { matchedLineId: bankLine.id, matchKind: "POSTED" } });
      return { entryId: entry.id, transactionId: entry.transactionId };
    });
  }
}
