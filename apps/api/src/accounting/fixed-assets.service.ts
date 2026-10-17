import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { JournalKind, LedgerAccountCategory, Prisma } from "@prisma/client";
import { parseCalendarDate } from "../fiscal/saft/period";
import { PrismaService } from "../prisma/prisma.service";
import { dateValue, isoDate } from "./accounting-dates";
import { EntriesService } from "./entries.service";
import { LineInput } from "./entry-rules";
import { ASSET_CATEGORIES, depreciationStart, monthlyDepreciation } from "./fixed-assets";
import { periodDates } from "./periods";

const ZERO = new Prisma.Decimal(0);

/**
 * The fixed asset register (B4): an asset is registered (and its purchase
 * posted, if asked), depreciated month by month in one entry for all
 * assets (never twice for the same month), and disposed of with its gain
 * or loss.
 */
@Injectable()
export class FixedAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entries: EntriesService,
  ) {}

  private async accountByCode(businessId: string, code: string) {
    const a = await this.prisma.ledgerAccount.findUnique({ where: { businessId_code: { businessId, code } } });
    if (!a || a.category !== LedgerAccountCategory.GM || !a.isActive) throw new BadRequestException(`Account ${code} is not an active movement account`);
    return a;
  }

  async list(businessId: string) {
    const assets = await this.prisma.fixedAsset.findMany({ where: { businessId }, include: { depreciations: { select: { amount: true } } }, orderBy: { code: "asc" } });
    return assets.map((a) => {
      const depreciated = a.depreciations.reduce((s, d) => s.plus(d.amount), ZERO);
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        category: a.category,
        acquisitionDate: isoDate(a.acquisitionDate),
        acquisitionValue: a.acquisitionValue.toFixed(2),
        residualValue: a.residualValue.toFixed(2),
        annualRate: a.annualRate.toString(),
        depreciated: depreciated.toFixed(2),
        netBookValue: a.acquisitionValue.minus(depreciated).toFixed(2),
        status: a.status,
        disposalDate: a.disposalDate ? isoDate(a.disposalDate) : null,
        disposalValue: a.disposalValue?.toFixed(2) ?? null,
      };
    });
  }

  /** Registers an asset; with `counterAccountId`, posts its purchase (asset account against it). */
  async create(
    businessId: string,
    userId: string,
    input: { name: string; category: string; acquisitionDate: string; acquisitionValue: number; residualValue?: number; annualRate?: number; counterAccountId?: string; note?: string },
  ) {
    const category = ASSET_CATEGORIES[input.category];
    if (!category) throw new BadRequestException("Unknown asset category");
    const rate = input.annualRate ?? category.maxRate;
    if (rate <= 0 || rate > category.maxRate) throw new BadRequestException(`The rate for this category is at most ${category.maxRate}% a year (Decreto 207/15)`);
    const date = parseCalendarDate(input.acquisitionDate);
    const value = new Prisma.Decimal(input.acquisitionValue);
    const residual = new Prisma.Decimal(input.residualValue ?? 0);
    if (value.lte(0) || residual.lt(0) || residual.gte(value)) throw new BadRequestException("The value must be positive and the residual value below it");
    const [asset, accumulated, expense] = await Promise.all([this.accountByCode(businessId, category.asset), this.accountByCode(businessId, category.accumulated), this.accountByCode(businessId, category.expense)]);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assets:${businessId}`}))`;
      const n = (await tx.fixedAsset.count({ where: { businessId } })) + 1;
      let acquisitionEntryId: string | null = null;
      if (input.counterAccountId) {
        const journal = await this.entries.systemJournal(tx, businessId, JournalKind.GENERAL);
        const e = await this.entries.post(
          {
            businessId,
            journalId: journal.id,
            transactionDate: date,
            description: `Aquisição de imobilizado: ${input.name}`,
            sourceUserId: userId,
            origin: "MANUAL",
            lines: [
              { accountId: asset.id, debit: value },
              { accountId: input.counterAccountId, credit: value },
            ],
          },
          tx,
        );
        acquisitionEntryId = e.id;
      }
      return tx.fixedAsset.create({
        data: {
          businessId,
          code: `IMO-${String(n).padStart(4, "0")}`,
          name: input.name.trim().slice(0, 120),
          category: input.category,
          assetAccountId: asset.id,
          accumulatedAccountId: accumulated.id,
          expenseAccountId: expense.id,
          acquisitionDate: dateValue(date),
          acquisitionValue: value,
          residualValue: residual,
          annualRate: new Prisma.Decimal(rate),
          depreciationStart: dateValue(depreciationStart(date)),
          acquisitionEntryId,
          note: input.note?.trim() || null,
        },
      });
    });
  }

  /**
   * The month's depreciation of every active asset, in one entry (journal
   * Operações diversas, the month's last day); assets already depreciated
   * for that month are left out, so running it twice posts nothing more.
   */
  async depreciate(businessId: string, userId: string, year: number, month: number) {
    if (month < 1 || month > 12) throw new BadRequestException("Choose a month from 1 to 12");
    const assets = await this.prisma.fixedAsset.findMany({ where: { businessId, status: "ACTIVE" }, include: { depreciations: true } });
    const items: { assetId: string; code: string; name: string; amount: Prisma.Decimal; expense: string; accumulated: string }[] = [];
    for (const a of assets) {
      if (a.depreciations.some((d) => d.year === year && d.month === month)) continue;
      const done = a.depreciations.reduce((s, d) => s.plus(d.amount), ZERO);
      const amount = monthlyDepreciation({ ...a, depreciationStart: isoDate(a.depreciationStart) }, year, month, done);
      if (amount.gt(0)) items.push({ assetId: a.id, code: a.code, name: a.name, amount, expense: a.expenseAccountId, accumulated: a.accumulatedAccountId });
    }
    if (!items.length) return { assets: 0, total: "0.00", entryId: null };
    const date = periodDates(year, month).endDate;
    return this.prisma.$transaction(async (tx) => {
      const journal = await this.entries.systemJournal(tx, businessId, JournalKind.GENERAL);
      const lines: LineInput[] = items.flatMap((i) => [
        { accountId: i.expense, debit: i.amount, description: `Amortização ${i.code} ${i.name}`, sourceDocumentId: i.code },
        { accountId: i.accumulated, credit: i.amount, description: `Amortização ${i.code} ${i.name}`, sourceDocumentId: i.code },
      ]);
      const entry = await this.entries.post(
        { businessId, journalId: journal.id, transactionDate: date, description: `Amortizações de ${String(month).padStart(2, "0")}/${year}`, sourceUserId: userId, origin: "DEPRECIATION", lines },
        tx,
      );
      // Unique per asset and month: a second run racing this one fails here, rolled back with its entry.
      await tx.assetDepreciation.createMany({ data: items.map((i) => ({ assetId: i.assetId, year, month, amount: i.amount, entryId: entry.id })) });
      return { assets: items.length, total: items.reduce((s, i) => s.plus(i.amount), ZERO).toFixed(2), entryId: entry.id };
    });
  }

  /**
   * Disposal (sale or write-off): the asset and its accumulated
   * depreciation leave the books; what it fetched goes to `counterAccountId`
   * (cash, bank, a debtor); the difference with its book value is a gain
   * (68.4.1) or a loss (78.4.1).
   */
  async dispose(businessId: string, userId: string, id: string, input: { date: string; saleValue?: number; counterAccountId?: string }) {
    const asset = await this.prisma.fixedAsset.findFirst({ where: { id, businessId }, include: { depreciations: true } });
    if (!asset) throw new NotFoundException("Asset not found");
    if (asset.status !== "ACTIVE") throw new BadRequestException("This asset was already disposed of");
    const date = parseCalendarDate(input.date);
    const sale = new Prisma.Decimal(input.saleValue ?? 0);
    if (sale.gt(0) && !input.counterAccountId) throw new BadRequestException("Say where the money from the sale went");
    const accumulated = asset.depreciations.reduce((s, d) => s.plus(d.amount), ZERO);
    const bookValue = asset.acquisitionValue.minus(accumulated);
    const result = sale.minus(bookValue);
    const [gain, loss] = await Promise.all([this.accountByCode(businessId, "68.4.1"), this.accountByCode(businessId, "78.4.1")]);
    const label = `Alienação/abate de ${asset.code} ${asset.name}`;
    const lines: LineInput[] = [
      { accountId: asset.accumulatedAccountId, debit: accumulated, description: label, sourceDocumentId: asset.code },
      { accountId: input.counterAccountId ?? asset.assetAccountId, debit: sale, description: label, sourceDocumentId: asset.code },
      { accountId: asset.assetAccountId, credit: asset.acquisitionValue, description: label, sourceDocumentId: asset.code },
      result.gt(0) ? { accountId: gain.id, credit: result, description: label } : { accountId: loss.id, debit: result.negated(), description: label },
    ];
    return this.prisma.$transaction(async (tx) => {
      const journal = await this.entries.systemJournal(tx, businessId, JournalKind.GENERAL);
      const entry = await this.entries.post({ businessId, journalId: journal.id, transactionDate: date, description: label, sourceUserId: userId, origin: "MANUAL", lines }, tx);
      await tx.fixedAsset.update({ where: { id: asset.id }, data: { status: "DISPOSED", disposalDate: dateValue(date), disposalValue: sale, disposalEntryId: entry.id } });
      return { entryId: entry.id, transactionId: entry.transactionId, bookValue: bookValue.toFixed(2), result: result.toFixed(2) };
    });
  }
}
