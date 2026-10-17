import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { JournalKind, Prisma, TransactionType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EntriesService, EntryWithLines } from "./entries.service";
import { lineProblems, normaliseLines } from "./entry-rules";
import { OPENING_PERIOD } from "./periods";

export interface TemplateLine {
  accountId: string;
  side: "D" | "C";
  /** Left out when it changes every time (the amount is typed when used). */
  amount?: number | null;
  description?: string | null;
}

/**
 * Lançamentos pré-definidos (recurring entries) and the opening balances
 * (docs/ACCOUNTING-DECISIONS.md, step A5).
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entries: EntriesService,
  ) {}

  list(businessId: string) {
    return this.prisma.entryTemplate.findMany({ where: { businessId }, orderBy: { name: "asc" } });
  }

  async save(businessId: string, id: string | null, input: { name: string; journalId: string; description: string; transactionType?: TransactionType; lines: TemplateLine[] }) {
    await this.checkLines(businessId, input.journalId, input.lines);
    const data = {
      name: input.name.trim().slice(0, 80),
      journalId: input.journalId,
      description: input.description.trim().slice(0, 200),
      transactionType: input.transactionType ?? TransactionType.N,
      lines: input.lines.map((l) => ({ accountId: l.accountId, side: l.side, amount: l.amount ?? null, description: l.description?.trim() || null })) as Prisma.InputJsonValue,
    };
    if (!id) return this.prisma.entryTemplate.create({ data: { businessId, ...data } });
    const existing = await this.prisma.entryTemplate.findFirst({ where: { id, businessId } });
    if (!existing) throw new NotFoundException("Template not found");
    return this.prisma.entryTemplate.update({ where: { id }, data });
  }

  async remove(businessId: string, id: string) {
    const { count } = await this.prisma.entryTemplate.deleteMany({ where: { id, businessId } });
    if (!count) throw new NotFoundException("Template not found");
    return { removed: true };
  }

  private async checkLines(businessId: string, journalId: string, lines: TemplateLine[]) {
    if (!(await this.prisma.journal.findFirst({ where: { id: journalId, businessId } }))) throw new NotFoundException("Journal not found");
    if (lines.length < 2 || !lines.some((l) => l.side === "D") || !lines.some((l) => l.side === "C")) {
      throw new BadRequestException("An entry needs at least one debit and one credit line");
    }
    const ids = [...new Set(lines.map((l) => l.accountId))];
    if ((await this.prisma.ledgerAccount.count({ where: { businessId, id: { in: ids } } })) !== ids.length) throw new NotFoundException("Account not found");
  }

  /**
   * Opening balances for a year (a new client, or a year whose previous one
   * isn't in the app): one balanced entry in the Abertura journal, period
   * 0, dated 1 January. Debit balances on the debit side, credit on the other.
   */
  async opening(businessId: string, userId: string, year: number, lines: { accountId: string; debit?: number; credit?: number }[]): Promise<EntryWithLines> {
    const checked = normaliseLines(lines.map((l) => ({ accountId: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0 })));
    const problems = lineProblems(checked);
    if (problems.length) throw new BadRequestException(problems[0]);
    const journal = await this.entries.systemJournal(this.prisma, businessId, JournalKind.OPENING);
    return this.entries.post({
      businessId,
      journalId: journal.id,
      transactionDate: `${year}-01-01`,
      postingDate: `${year}-01-01`,
      period: OPENING_PERIOD,
      description: `Saldos de abertura ${year}`,
      sourceUserId: userId,
      origin: "OPENING",
      lines: checked.map((l) => ({ ...l, description: "Saldo de abertura" })),
    });
  }
}
