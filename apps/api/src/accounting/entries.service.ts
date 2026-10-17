import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { JournalKind, LedgerAccountCategory, PeriodStatus, Prisma, TransactionType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { parseCalendarDate } from "../fiscal/saft/period";
import { businessToday, dateValue, isoDate } from "./accounting-dates";
import { archivalNumber, description200, LineInput, lineProblems, normaliseLines, transactionId, ZERO } from "./entry-rules";
import { DEFAULT_JOURNALS } from "./journals";
import { dateFitsPeriod, monthPeriod, OPENING_PERIOD } from "./periods";
import { PeriodsService } from "./periods.service";

type Tx = Prisma.TransactionClient;

export interface PostEntryInput {
  businessId: string;
  /** A journal id, or the kind of system journal to use. */
  journalId?: string;
  journalKind?: JournalKind;
  /** YYYY-MM-DD: the date on the document behind it. */
  transactionDate: string;
  /** YYYY-MM-DD: the date it counts; defaults to the transaction date. */
  postingDate?: string;
  /** 0-15; defaults to the posting date's month. */
  period?: number;
  description: string;
  transactionType?: TransactionType;
  sourceUserId: string;
  customerId?: string | null;
  supplierId?: string | null;
  origin: string;
  reversesEntryId?: string | null;
  lines: LineInput[];
}

const ENTRY_INCLUDE = {
  journal: { select: { id: true, code: true, name: true } },
  lines: { orderBy: { lineNumber: "asc" }, include: { account: { select: { id: true, code: true, name: true } } } },
  reversedBy: { select: { id: true, transactionId: true } },
  reverses: { select: { id: true, transactionId: true } },
} satisfies Prisma.JournalEntryInclude;

export type EntryWithLines = Prisma.JournalEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

/**
 * Journals and entries (step A3). `post` is the only way an entry is
 * written: manual entries, the POS integration, the opening and the
 * year-end all go through it.
 */
@Injectable()
export class EntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
  ) {}

  async installJournals(tx: Tx, businessId: string) {
    for (const j of DEFAULT_JOURNALS) {
      await tx.journal.upsert({
        where: { businessId_code: { businessId, code: j.code } },
        create: { businessId, code: j.code, name: j.name, kind: j.kind, system: true },
        update: {},
      });
    }
  }

  journals(businessId: string) {
    return this.prisma.journal.findMany({ where: { businessId }, orderBy: [{ system: "desc" }, { code: "asc" }] });
  }

  async createJournal(businessId: string, input: { code: string; name: string; kind: JournalKind }) {
    const code = input.code.trim().toUpperCase();
    if (!/^[^\s]{1,30}$/.test(code)) throw new BadRequestException("Journal codes have no spaces (up to 30 characters)");
    if (await this.prisma.journal.findUnique({ where: { businessId_code: { businessId, code } } })) {
      throw new ConflictException(`There's already a journal ${code}`);
    }
    return this.prisma.journal.create({ data: { businessId, code, name: input.name.trim().slice(0, 60), kind: input.kind } });
  }

  async updateJournal(businessId: string, id: string, input: { name?: string; isActive?: boolean }) {
    const journal = await this.prisma.journal.findFirst({ where: { id, businessId } });
    if (!journal) throw new NotFoundException("Journal not found");
    return this.prisma.journal.update({
      where: { id },
      data: { ...(input.name ? { name: input.name.trim().slice(0, 60) } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) },
    });
  }

  /** The journal an entry made by the app goes to. */
  async systemJournal(db: Tx | PrismaService, businessId: string, kind: JournalKind) {
    const journal = await db.journal.findFirst({ where: { businessId, kind, isActive: true }, orderBy: [{ system: "desc" }, { createdAt: "asc" }] });
    if (!journal) throw new BadRequestException(`There's no active journal for ${kind.toLowerCase()} entries`);
    return journal;
  }

  /**
   * Writes a balanced entry, numbered in its journal and year, in an open
   * period. Runs inside the caller's transaction (the integration links its
   * source in the same one), or its own.
   */
  async post(input: PostEntryInput, tx?: Tx): Promise<EntryWithLines> {
    if (!tx) return this.prisma.$transaction((t) => this.post(input, t), { timeout: 60_000 });
    const lines = normaliseLines(input.lines);
    const problems = lineProblems(lines);
    if (problems.length) throw new BadRequestException(problems[0]);

    const transactionDate = parseCalendarDate(input.transactionDate);
    const postingDate = parseCalendarDate(input.postingDate ?? input.transactionDate);
    const year = Number(postingDate.slice(0, 4));
    const period = input.period ?? monthPeriod(postingDate).number;
    if (!dateFitsPeriod(postingDate, year, period)) {
      throw new BadRequestException(`The posting date ${postingDate} isn't in period ${period} of ${year}`);
    }
    if (period === OPENING_PERIOD && !["OPENING", "CARRY_FORWARD"].includes(input.origin)) {
      throw new BadRequestException("Period 0 holds the opening balances only");
    }

    const journal = input.journalId
      ? await tx.journal.findFirst({ where: { id: input.journalId, businessId: input.businessId } })
      : await this.systemJournal(tx, input.businessId, input.journalKind ?? JournalKind.GENERAL);
    if (!journal) throw new NotFoundException("Journal not found");
    if (!journal.isActive) throw new BadRequestException(`Journal ${journal.code} is inactive`);

    await this.periods.ensureYear(tx, input.businessId, year);
    const p = await this.periods.period(tx, input.businessId, year, period);
    const fiscalYear = await tx.fiscalYear.findUniqueOrThrow({ where: { id: p.fiscalYearId } });
    if (fiscalYear.status !== PeriodStatus.OPEN) throw new BadRequestException(`The year ${year} is closed: nothing can be posted in it`);
    if (p.status !== PeriodStatus.OPEN) throw new BadRequestException(`Period ${period}/${year} is closed: nothing can be posted in it`);

    const accounts = await tx.ledgerAccount.findMany({ where: { businessId: input.businessId, id: { in: [...new Set(lines.map((l) => l.accountId))] } } });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const l of lines) {
      const a = byId.get(l.accountId);
      if (!a) throw new BadRequestException("Account not found");
      if (a.category !== LedgerAccountCategory.GM) throw new BadRequestException(`Account ${a.code} is not a movement account: only movement (GM) accounts take postings`);
      if (!a.isActive) throw new BadRequestException(`Account ${a.code} is inactive`);
    }

    const [{ number }] = await tx.$queryRaw<{ number: number }[]>`
      INSERT INTO "journal_counters" ("journalId", "year", "next") VALUES (${journal.id}, ${year}, 2)
      ON CONFLICT ("journalId", "year") DO UPDATE SET "next" = "journal_counters"."next" + 1
      RETURNING "next" - 1 AS "number"`;
    const archival = archivalNumber(year, Number(number));
    const total = lines.reduce((s, l) => s.plus(l.debit), ZERO);
    const description = description200(input.description);
    const entry = await tx.journalEntry.create({
      data: {
        businessId: input.businessId,
        journalId: journal.id,
        year,
        period,
        number: Number(number),
        docArchivalNumber: archival,
        transactionId: transactionId(transactionDate, journal.code, archival),
        transactionDate: dateValue(transactionDate),
        postingDate: dateValue(postingDate),
        description,
        transactionType: input.transactionType ?? TransactionType.N,
        sourceUserId: input.sourceUserId,
        customerId: input.customerId ?? null,
        supplierId: input.supplierId ?? null,
        origin: input.origin,
        reversesEntryId: input.reversesEntryId ?? null,
        totalDebit: total,
        totalCredit: total,
      },
    });
    await tx.journalEntryLine.createMany({
      data: lines.map((l, i) => ({
        entryId: entry.id,
        lineNumber: i + 1,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: description200(l.description ?? description),
        sourceDocumentId: l.sourceDocumentId ? Array.from(l.sourceDocumentId).slice(0, 30).join("") : null,
      })),
    });
    // The balance rule is checked at commit; Prisma doesn't report a failed
    // COMMIT of an interactive transaction (it resolves, the data is rolled
    // back). Checking it now makes any breach an error here.
    await tx.$executeRaw`SET CONSTRAINTS "journal_entries_balanced", "journal_entry_lines_balanced" IMMEDIATE`;
    return tx.journalEntry.findUniqueOrThrow({ where: { id: entry.id }, include: ENTRY_INCLUDE });
  }

  /**
   * An estorno: the same lines with debit and credit swapped, dated `date`
   * (default today) in an open period. An entry is reversed once.
   */
  async reverse(businessId: string, userId: string, entryId: string, input: { date?: string; description?: string } = {}, tx?: Tx): Promise<EntryWithLines> {
    if (!tx) return this.prisma.$transaction((t) => this.reverse(businessId, userId, entryId, input, t), { timeout: 60_000 });
    const original = await tx.journalEntry.findFirst({ where: { id: entryId, businessId }, include: { lines: { orderBy: { lineNumber: "asc" } }, journal: true, reversedBy: true } });
    if (!original) throw new NotFoundException("Entry not found");
    if (original.reversedBy) throw new ConflictException(`Entry ${original.transactionId} was already reversed by ${original.reversedBy.transactionId}`);
    if (original.period === OPENING_PERIOD && original.origin !== "CARRY_FORWARD" && original.origin !== "OPENING") {
      throw new BadRequestException("Period 0 holds the opening balances only");
    }
    const business = await tx.business.findUniqueOrThrow({ where: { id: businessId } });
    const date = input.date ? parseCalendarDate(input.date) : businessToday(business);
    // An opening entry is reversed in its own period 0 (it moves no money).
    const period = original.period === OPENING_PERIOD ? OPENING_PERIOD : undefined;
    return this.post(
      {
        businessId,
        journalId: original.journalId,
        transactionDate: period === OPENING_PERIOD ? isoDate(original.postingDate) : date,
        postingDate: period === OPENING_PERIOD ? isoDate(original.postingDate) : date,
        period,
        description: input.description?.trim() || `Estorno de ${original.transactionId}: ${original.description}`,
        transactionType: original.transactionType,
        sourceUserId: userId,
        customerId: original.customerId,
        supplierId: original.supplierId,
        origin: period === OPENING_PERIOD ? original.origin : "REVERSAL",
        reversesEntryId: original.id,
        lines: original.lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit, description: l.description, sourceDocumentId: l.sourceDocumentId })),
      },
      tx,
    );
  }

  async get(businessId: string, id: string): Promise<EntryWithLines> {
    const entry = await this.prisma.journalEntry.findFirst({ where: { id, businessId }, include: ENTRY_INCLUDE });
    if (!entry) throw new NotFoundException("Entry not found");
    return entry;
  }

  async list(
    businessId: string,
    f: { year?: number; period?: number; journalId?: string; accountId?: string; origin?: string; from?: string; to?: string; search?: string; take?: number; skip?: number },
  ) {
    const where: Prisma.JournalEntryWhereInput = {
      businessId,
      ...(f.year ? { year: f.year } : {}),
      ...(f.period !== undefined ? { period: f.period } : {}),
      ...(f.journalId ? { journalId: f.journalId } : {}),
      ...(f.origin ? { origin: f.origin } : {}),
      ...(f.accountId ? { lines: { some: { accountId: f.accountId } } } : {}),
      ...(f.from || f.to
        ? { postingDate: { ...(f.from ? { gte: dateValue(parseCalendarDate(f.from)) } : {}), ...(f.to ? { lte: dateValue(parseCalendarDate(f.to)) } : {}) } }
        : {}),
      ...(f.search?.trim()
        ? {
            OR: [
              { description: { contains: f.search.trim(), mode: "insensitive" as const } },
              { transactionId: { contains: f.search.trim(), mode: "insensitive" as const } },
              { lines: { some: { sourceDocumentId: { contains: f.search.trim(), mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        include: ENTRY_INCLUDE,
        orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
        take: Math.min(f.take ?? 50, 200),
        skip: f.skip ?? 0,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return { items: items.map(serializeEntry), total };
  }
}

export function serializeEntry(e: EntryWithLines) {
  return {
    id: e.id,
    journal: e.journal,
    year: e.year,
    period: e.period,
    number: e.number,
    docArchivalNumber: e.docArchivalNumber,
    transactionId: e.transactionId,
    transactionDate: isoDate(e.transactionDate),
    postingDate: isoDate(e.postingDate),
    description: e.description,
    transactionType: e.transactionType,
    origin: e.origin,
    sourceUserId: e.sourceUserId,
    customerId: e.customerId,
    supplierId: e.supplierId,
    totalDebit: e.totalDebit.toFixed(2),
    totalCredit: e.totalCredit.toFixed(2),
    systemEntryDate: e.systemEntryDate,
    reverses: e.reverses,
    reversedBy: e.reversedBy,
    lines: e.lines.map((l) => ({
      lineNumber: l.lineNumber,
      account: l.account,
      debit: l.debit.toFixed(2),
      credit: l.credit.toFixed(2),
      description: l.description,
      sourceDocumentId: l.sourceDocumentId,
    })),
  };
}
