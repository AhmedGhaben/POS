import { BadRequestException, HttpException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { JournalKind, Prisma } from "@prisma/client";
import { countryConfig } from "../countries";
import { fiscalTimeZone, localDateTime } from "../fiscal/fiscal-format";
import { startOfLocalDay } from "../fiscal/saft/period";
import { PrismaService } from "../prisma/prisma.service";
import { AccountResolver } from "./account-resolver";
import { businessTimeZone, businessToday, dateValue, isoDate } from "./accounting-dates";
import { ChartService } from "./chart.service";
import { D, LineInput, ZERO } from "./entry-rules";
import { EntriesService } from "./entries.service";
import {
  cashMovementPlan,
  DocumentForPosting,
  documentPlan,
  expensePlan,
  MappingError,
  PostingPlan,
  purchasePlan,
  reversedLines,
  shiftDifferencePlan,
  stockAdjustmentPlan,
  sumLines,
  supplierPaymentPlan,
} from "./posting-rules";

export const SOURCE_TYPES = [
  "FISCAL_DOCUMENT",
  "FISCAL_DOCUMENT_ANNULMENT",
  "PURCHASE",
  "SUPPLIER_PAYMENT",
  "SUPPLIER_PAYMENT_CANCEL",
  "EXPENSE",
  "SHIFT_DIFFERENCE",
  "CASH_MOVEMENT",
  "STOCK_ADJUSTMENT",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

const POSTED_DOCUMENT_TYPES = ["FR", "FT", "NC", "ND", "RC"];
/** What a "daily summary" adds up per till and day. */
const SUMMARY_TYPES = ["FR", "NC", "RC"];
const BATCH = 300;
const EXPENSE_NAMES: Record<string, string> = {
  RENT: "Rendas",
  UTILITIES: "Água, electricidade e comunicações",
  SUPPLIES: "Material",
  PAYROLL: "Salários",
  MARKETING: "Publicidade",
  MAINTENANCE: "Manutenção",
  OTHER: "Outras despesas",
};

export interface RunResult {
  posted: number;
  skipped: number;
  failed: number;
}

interface SourceRef {
  type: SourceType;
  id: string;
  documentNo: string | null;
  /** The record's date (YYYY-MM-DD), for the monitor and the period checks. */
  date: string;
}

interface RunContext {
  businessId: string;
  userId: string;
  resolver: AccountResolver;
  startDate: string;
  startInstant: Date;
  today: string;
  businessZone: string;
  /** Daily summaries only for days already over. */
  summary: boolean;
  cashPerTill: boolean;
  zoneOf: (storeId: string) => string;
  tillName: (terminalId: string | null, storeId: string) => string;
  typeName: (documentType: string) => string;
  result: RunResult;
}

const docDate = (d: Date) => isoDate(d);

/**
 * The automatic posting from the POS (docs/ACCOUNTING-DECISIONS.md, step
 * A4). Reads what isn't posted yet and posts it, each record (or a till's
 * day) in its own transaction with its link, so nothing is posted twice
 * and one bad record never blocks the rest: it waits in the monitor with
 * its error.
 */
@Injectable()
export class IntegrationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationService.name);
  private readonly running = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entries: EntriesService,
    private readonly chart: ChartService,
  ) {}

  onModuleInit() {
    const configured = process.env.ACCOUNTING_INTEGRATION_INTERVAL_MS;
    const interval = configured !== undefined ? Number(configured) : process.env.NODE_ENV === "test" ? 0 : 10 * 60_000;
    if (interval > 0) this.timer = setInterval(() => void this.runAll().catch((e) => this.logger.error(`Accounting integration: ${e}`)), interval);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Every business that keeps its books here and posts automatically. */
  async runAll(now = new Date()) {
    const businesses = await this.prisma.accountingSettings.findMany({ where: { enabled: true, autoPost: true }, select: { businessId: true, enabledById: true } });
    for (const b of businesses) {
      const owner = b.enabledById ?? (await this.prisma.user.findFirst({ where: { businessId: b.businessId, role: "OWNER" }, select: { id: true } }))?.id;
      if (owner) await this.run(b.businessId, owner, now).catch((e) => this.logger.error(`Accounting integration (${b.businessId}): ${e}`));
    }
  }

  /** One pass for a business; a pass already running for it is not started twice. */
  async run(businessId: string, userId: string, now = new Date()): Promise<RunResult> {
    const result: RunResult = { posted: 0, skipped: 0, failed: 0 };
    if (this.running.has(businessId)) return result;
    this.running.add(businessId);
    try {
      const ctx = await this.context(businessId, userId, now, result);
      if (!ctx) return result;
      await this.documents(ctx);
      await this.annulments(ctx);
      await this.purchases(ctx);
      await this.supplierPayments(ctx);
      await this.expenses(ctx);
      await this.shifts(ctx);
      await this.cashMovements(ctx);
      await this.stockAdjustments(ctx);
      return result;
    } finally {
      this.running.delete(businessId);
    }
  }

  private async context(businessId: string, userId: string, now: Date, result: RunResult): Promise<RunContext | null> {
    const settings = await this.prisma.accountingSettings.findUnique({ where: { businessId } });
    if (!settings?.enabled) return null;
    await this.chart.ensureLinkedAccounts(businessId);
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const [accounts, mappings, stores, terminals] = await Promise.all([
      this.prisma.ledgerAccount.findMany({ where: { businessId } }),
      this.prisma.accountMapping.findMany({ where: { businessId } }),
      this.prisma.store.findMany({ where: { businessId }, select: { id: true, name: true, timezone: true, country: true } }),
      this.prisma.terminal.findMany({ where: { businessId }, select: { id: true, code: true, name: true } }),
    ]);
    const zones = new Map(stores.map((s) => [s.id, fiscalTimeZone(s.timezone, countryConfig(s.country)?.timeZone)]));
    const storeNames = new Map(stores.map((s) => [s.id, s.name]));
    const tills = new Map(terminals.map((t) => [t.id, `${t.code} ${t.name}`]));
    const startDate = isoDate(settings.startDate);
    const config = countryConfig(business.country);
    return {
      businessId,
      userId,
      resolver: new AccountResolver(accounts, mappings, settings.cashPerTill),
      startDate,
      startInstant: startOfLocalDay(startDate, businessTimeZone(business)),
      today: businessToday(business, now),
      businessZone: businessTimeZone(business),
      summary: settings.grouping === "DAILY_SUMMARY",
      cashPerTill: settings.cashPerTill,
      zoneOf: (storeId) => zones.get(storeId) ?? businessTimeZone(business),
      tillName: (terminalId, storeId) => (terminalId ? (tills.get(terminalId) ?? terminalId) : (storeNames.get(storeId) ?? "")),
      typeName: (t) => config?.documentTypes[t] ?? t,
      result,
    };
  }

  // ---------------------------------------------------------------- documents

  private async documents(ctx: RunContext) {
    // One entry per document (all of them, or those a daily summary doesn't take).
    const perDocument = ctx.summary ? POSTED_DOCUMENT_TYPES.filter((t) => !SUMMARY_TYPES.includes(t)) : POSTED_DOCUMENT_TYPES;
    let cursor = "";
    for (;;) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT d.id FROM "fiscal_documents" d
        WHERE d."businessId" = ${ctx.businessId} AND d."documentType" IN (${Prisma.join(perDocument)}) AND d."invoiceDate" >= ${dateValue(ctx.startDate)} AND d.id > ${cursor}
          AND NOT EXISTS (SELECT 1 FROM "accounting_source_links" l WHERE l."businessId" = d."businessId" AND l."sourceType" = 'FISCAL_DOCUMENT' AND l."sourceId" = d.id)
        ORDER BY d.id
        LIMIT ${BATCH}`;
      if (!rows.length) break;
      cursor = rows[rows.length - 1].id;
      for (const { doc, raw } of await this.loadDocuments(ctx, rows.map((r) => r.id))) {
        const ref: SourceRef = { type: "FISCAL_DOCUMENT", id: doc.id, documentNo: doc.documentNo, date: doc.date };
        if (raw.status === "A") await this.skip(ctx, ref);
        else await this.postPlan(ctx, [ref], () => documentPlan(doc, ctx.resolver), raw.sourceId);
      }
      if (rows.length < BATCH) break;
    }
    if (!ctx.summary) return;
    // Daily summaries: each till's (or browser store's) day, once the day is over.
    const groups = await this.prisma.$queryRaw<{ storeId: string; terminalId: string | null; invoiceDate: Date }[]>`
      SELECT DISTINCT d."storeId", d."terminalId", d."invoiceDate" FROM "fiscal_documents" d
      WHERE d."businessId" = ${ctx.businessId} AND d."documentType" IN (${Prisma.join(SUMMARY_TYPES)})
        AND d."invoiceDate" >= ${dateValue(ctx.startDate)} AND d."invoiceDate" < ${dateValue(ctx.today)}
        AND NOT EXISTS (SELECT 1 FROM "accounting_source_links" l WHERE l."businessId" = d."businessId" AND l."sourceType" = 'FISCAL_DOCUMENT' AND l."sourceId" = d.id)
      ORDER BY d."invoiceDate"`;
    for (const g of groups) {
      const ids = await this.prisma.fiscalDocument.findMany({
        where: { businessId: ctx.businessId, storeId: g.storeId, terminalId: g.terminalId, invoiceDate: g.invoiceDate, documentType: { in: SUMMARY_TYPES } },
        select: { id: true },
      });
      const linked = new Set(
        (await this.prisma.accountingSourceLink.findMany({ where: { businessId: ctx.businessId, sourceType: "FISCAL_DOCUMENT", sourceId: { in: ids.map((i) => i.id) } }, select: { sourceId: true } })).map((l) => l.sourceId),
      );
      const open: DocumentForPosting[] = [];
      let user: string | undefined;
      for (const { doc, raw } of await this.loadDocuments(ctx, ids.map((i) => i.id).filter((id) => !linked.has(id)))) {
        if (raw.status === "A") await this.skip(ctx, { type: "FISCAL_DOCUMENT", id: doc.id, documentNo: doc.documentNo, date: doc.date });
        else {
          open.push(doc);
          user ??= raw.sourceId;
        }
      }
      if (open.length) await this.postSummary(ctx, `${g.storeId}|${g.terminalId ?? ""}|${isoDate(g.invoiceDate)}`, open, user);
    }
  }

  /** A till's (or a browser store's) documents of one day in one entry. */
  private async postSummary(ctx: RunContext, key: string, docs: DocumentForPosting[], sourceUserId?: string) {
    const [storeId, terminalId, date] = key.split("|");
    const plans: PostingPlan[] = [];
    const failures: { doc: DocumentForPosting; error: unknown }[] = [];
    for (const doc of docs) {
      try {
        plans.push(documentPlan(doc, ctx.resolver));
      } catch (error) {
        failures.push({ doc, error });
      }
    }
    if (failures.length) {
      // The day waits until every document in it can be posted.
      for (const doc of docs) {
        const own = failures.find((f) => f.doc.id === doc.id);
        await this.recordError(ctx, { type: "FISCAL_DOCUMENT", id: doc.id, documentNo: doc.documentNo, date: doc.date }, own ? own.error : new MappingError(`Waiting for ${failures[0].doc.documentNo}, in the same daily summary`));
      }
      return;
    }
    const refs = docs.map((d): SourceRef => ({ type: "FISCAL_DOCUMENT", id: d.id, documentNo: d.documentNo, date: d.date }));
    const till = ctx.tillName(terminalId || null, storeId);
    await this.postPlan(ctx, refs, () => ({
      journalKind: JournalKind.SALES,
      date,
      description: `Resumo diário ${till} ${date}: ${docs.length} documentos (${[...new Set(docs.map((d) => d.documentType))].join(", ")})`,
      lines: sumLines(plans),
    }), sourceUserId);
  }

  private async loadDocuments(ctx: RunContext, ids: string[]) {
    const raws = await this.prisma.fiscalDocument.findMany({
      where: { id: { in: ids } },
      include: { lines: { include: { taxes: true }, orderBy: { lineNumber: "asc" } }, customer: { select: { id: true, isFinalConsumer: true } } },
    });
    const productIds = [...new Set(raws.flatMap((d) => d.lines.map((l) => l.productId)).filter((id): id is string => !!id))];
    const types = new Map((await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, productType: true } })).map((p) => [p.id, p.productType as string]));
    const saleIds = raws.filter((d) => d.saleId && (d.documentType === "FR" || d.documentType === "FT")).map((d) => d.saleId!);
    const returnIds = raws.filter((d) => d.returnId).map((d) => d.returnId!);
    const movements = await this.prisma.stockMovement.findMany({
      where: { OR: [{ saleId: { in: saleIds }, type: "SALE" }, { returnId: { in: returnIds }, type: "RETURN" }] },
      select: { saleId: true, returnId: true, type: true, quantity: true, unitCost: true },
    });
    const cost = (match: (m: (typeof movements)[number]) => boolean) =>
      movements.filter(match).reduce((s, m) => s.plus(m.quantity.abs().times(m.unitCost)), ZERO).toDecimalPlaces(2);
    const order = new Map(ids.map((id, i) => [id, i]));
    return raws
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
      .map((raw) => {
        const doc: DocumentForPosting = {
          id: raw.id,
          documentType: raw.documentType,
          documentNo: raw.documentNo,
          typeName: ctx.typeName(raw.documentType),
          date: docDate(raw.invoiceDate),
          terminalId: raw.terminalId,
          customerId: raw.customer && !raw.customer.isFinalConsumer ? raw.customer.id : null,
          buyerName: raw.buyerName,
          grossTotal: raw.grossTotal,
          lines: raw.lines.map((l) => ({
            netAmount: l.netAmount,
            discountAmount: l.discountAmount,
            productType: (l.productId && types.get(l.productId)) || "P",
            taxes: l.taxes.map((t) => ({ taxType: t.taxType, percentage: t.percentage, amount: t.amount, exemptionCode: t.exemptionCode })),
          })),
          payments: (Array.isArray(raw.payments) ? (raw.payments as { method: string; amount: string }[]) : []).map((p) => ({ method: p.method, amount: D(p.amount) })),
          cogs:
            raw.documentType === "NC"
              ? raw.returnId
                ? cost((m) => m.returnId === raw.returnId)
                : ZERO
              : raw.saleId && (raw.documentType === "FR" || raw.documentType === "FT")
                ? cost((m) => m.saleId === raw.saleId)
                : ZERO,
        };
        return { doc, raw };
      });
  }

  /** Documents annulled after they were posted: their postings are reversed on the day they were annulled. */
  private async annulments(ctx: RunContext) {
    const rows = await this.prisma.$queryRaw<{ id: string; entryId: string }[]>`
      SELECT l."sourceId" AS id, l."entryId" FROM "accounting_source_links" l
      JOIN "fiscal_documents" d ON d.id = l."sourceId"
      WHERE l."businessId" = ${ctx.businessId} AND l."sourceType" = 'FISCAL_DOCUMENT' AND l.skipped = false AND d.status = 'A'
        AND NOT EXISTS (SELECT 1 FROM "accounting_source_links" a WHERE a."businessId" = l."businessId" AND a."sourceType" = 'FISCAL_DOCUMENT_ANNULMENT' AND a."sourceId" = l."sourceId")`;
    if (!rows.length) return;
    const docs = new Map((await this.loadDocuments(ctx, rows.map((r) => r.id))).map((d) => [d.doc.id, d]));
    for (const row of rows) {
      const loaded = docs.get(row.id)!;
      const date = localDateTime(loaded.raw.statusDate, ctx.zoneOf(loaded.raw.storeId)).date;
      const ref: SourceRef = { type: "FISCAL_DOCUMENT_ANNULMENT", id: row.id, documentNo: loaded.doc.documentNo, date };
      const sharing = await this.prisma.accountingSourceLink.count({ where: { entryId: row.entryId } });
      if (sharing === 1) {
        // Posted on its own: the exact reversal of its entry.
        await this.withLinks(ctx, [ref], (tx) => this.entries.reverse(ctx.businessId, loaded.raw.statusById ?? ctx.userId, row.entryId, { date, description: `Anulação de ${loaded.doc.documentNo}` }, tx));
      } else {
        // Part of a daily summary: its own postings, the other way round.
        await this.postPlan(ctx, [ref], () => {
          const plan = documentPlan(loaded.doc, ctx.resolver);
          return { ...plan, date, description: `Anulação de ${plan.description}`, lines: reversedLines(plan.lines) };
        }, loaded.raw.statusById ?? undefined, loaded.doc.date);
      }
    }
  }

  // ---------------------------------------------------------------- purchases and payments

  private async purchases(ctx: RunContext) {
    let cursor = "";
    for (;;) {
      const ids = await this.pendingIds(ctx, "PURCHASE", Prisma.sql`
        SELECT p.id FROM "purchases" p JOIN "stores" s ON s.id = p."storeId"
        WHERE s."businessId" = ${ctx.businessId} AND p.status <> 'CANCELLED' AND p."createdAt" >= ${ctx.startInstant}`, cursor);
      cursor = ids[ids.length - 1] ?? cursor;
      if (!ids.length) return;
      const purchases = await this.prisma.purchase.findMany({
        where: { id: { in: ids } },
        include: { supplier: { select: { id: true, name: true } }, taxLines: true, lineItems: { include: { product: { select: { trackStock: true } } } } },
        orderBy: { createdAt: "asc" },
      });
      for (const p of purchases) {
        const date = localDateTime(p.createdAt, ctx.zoneOf(p.storeId)).date;
        const documentNo = p.supplierDocNo ? `${p.supplierDocType ?? "FT"} ${p.supplierDocNo}` : p.purchaseNumber;
        const ref: SourceRef = { type: "PURCHASE", id: p.id, documentNo, date };
        const stock = p.lineItems.filter((l) => l.product.trackStock).reduce((s, l) => s.plus(l.lineTotal), ZERO);
        await this.postPlan(
          ctx,
          [ref],
          () =>
            purchasePlan(
              {
                id: p.id,
                documentNo,
                supplierId: p.supplier.id,
                supplierName: p.supplier.name,
                date,
                stockAmount: stock,
                nonStockAmount: p.subtotal.minus(stock),
                taxLines: p.taxLines.map((t) => ({ taxAmount: t.taxAmount, deductibleAmount: t.deductibleAmount, typology: t.typology })),
                total: p.total,
                withholdingAmount: p.withholdingAmount,
              },
              ctx.resolver,
            ),
          p.createdById,
          p.supplierDocDate ? docDate(p.supplierDocDate) : date,
        );
      }
      if (ids.length < BATCH) return;
    }
  }

  private async supplierPayments(ctx: RunContext) {
    let cursor = "";
    for (;;) {
      const ids = await this.pendingIds(ctx, "SUPPLIER_PAYMENT", Prisma.sql`
        SELECT p.id FROM "supplier_payments" p WHERE p."businessId" = ${ctx.businessId} AND p."paidOn" >= ${dateValue(ctx.startDate)}`, cursor);
      cursor = ids[ids.length - 1] ?? cursor;
      if (!ids.length) break;
      const payments = await this.prisma.supplierPayment.findMany({ where: { id: { in: ids } }, include: { supplier: { select: { id: true, name: true } } }, orderBy: { paidOn: "asc" } });
      for (const p of payments) {
        const ref: SourceRef = { type: "SUPPLIER_PAYMENT", id: p.id, documentNo: p.reference, date: docDate(p.paidOn) };
        if (p.cancelledAt) {
          await this.skip(ctx, ref);
          continue;
        }
        await this.postPlan(
          ctx,
          [ref],
          () => supplierPaymentPlan({ id: p.id, reference: p.reference, supplierId: p.supplier.id, supplierName: p.supplier.name, date: docDate(p.paidOn), amount: p.amount, method: p.method }, ctx.resolver),
          p.createdById,
        );
      }
      if (ids.length < BATCH) break;
    }
    // Payments cancelled after they were posted.
    const cancelled = await this.prisma.$queryRaw<{ id: string; entryId: string }[]>`
      SELECT l."sourceId" AS id, l."entryId" FROM "accounting_source_links" l JOIN "supplier_payments" p ON p.id = l."sourceId"
      WHERE l."businessId" = ${ctx.businessId} AND l."sourceType" = 'SUPPLIER_PAYMENT' AND l.skipped = false AND p."cancelledAt" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "accounting_source_links" a WHERE a."businessId" = l."businessId" AND a."sourceType" = 'SUPPLIER_PAYMENT_CANCEL' AND a."sourceId" = l."sourceId")`;
    for (const c of cancelled) {
      const p = await this.prisma.supplierPayment.findUniqueOrThrow({ where: { id: c.id } });
      const date = localDateTime(p.cancelledAt!, ctx.businessZone).date;
      const ref: SourceRef = { type: "SUPPLIER_PAYMENT_CANCEL", id: c.id, documentNo: p.reference, date };
      await this.withLinks(ctx, [ref], (tx) => this.entries.reverse(ctx.businessId, p.cancelledById ?? ctx.userId, c.entryId, { date, description: `Pagamento cancelado: ${p.cancelReason ?? ""}`.trim() }, tx));
    }
  }

  private async expenses(ctx: RunContext) {
    let cursor = "";
    for (;;) {
      const ids = await this.pendingIds(ctx, "EXPENSE", Prisma.sql`
        SELECT e.id FROM "expenses" e JOIN "stores" s ON s.id = e."storeId"
        WHERE s."businessId" = ${ctx.businessId} AND e."incurredAt" >= ${ctx.startInstant}`, cursor);
      cursor = ids[ids.length - 1] ?? cursor;
      if (!ids.length) return;
      const expenses = await this.prisma.expense.findMany({ where: { id: { in: ids } }, orderBy: { incurredAt: "asc" } });
      for (const e of expenses) {
        const date = localDateTime(e.incurredAt, ctx.zoneOf(e.storeId)).date;
        const ref: SourceRef = { type: "EXPENSE", id: e.id, documentNo: null, date };
        await this.postPlan(ctx, [ref], () => expensePlan({ category: e.category, categoryName: EXPENSE_NAMES[e.category] ?? e.category, description: e.description, date, amount: e.amount }, ctx.resolver), e.createdById);
      }
      if (ids.length < BATCH) return;
    }
  }

  // ---------------------------------------------------------------- cash and stock

  private async shifts(ctx: RunContext) {
    let cursor = "";
    for (;;) {
      const ids = await this.pendingIds(ctx, "SHIFT_DIFFERENCE", Prisma.sql`
        SELECT s.id FROM "shifts" s
        WHERE s."businessId" = ${ctx.businessId} AND s.status = 'CLOSED' AND s.difference IS NOT NULL AND s.difference <> 0 AND s."closedAt" >= ${ctx.startInstant}`, cursor);
      cursor = ids[ids.length - 1] ?? cursor;
      if (!ids.length) return;
      const shifts = await this.prisma.shift.findMany({ where: { id: { in: ids } }, orderBy: { closedAt: "asc" } });
      for (const s of shifts) {
        const date = localDateTime(s.closedAt!, ctx.zoneOf(s.storeId)).date;
        const ref: SourceRef = { type: "SHIFT_DIFFERENCE", id: s.id, documentNo: null, date };
        await this.postPlan(ctx, [ref], () => shiftDifferencePlan({ terminalId: s.terminalId, tillName: ctx.tillName(s.terminalId, s.storeId), date, difference: s.difference! }, ctx.resolver), s.closedById ?? s.openedById);
      }
      if (ids.length < BATCH) return;
    }
  }

  private async cashMovements(ctx: RunContext) {
    let cursor = "";
    for (;;) {
      const ids = await this.pendingIds(ctx, "CASH_MOVEMENT", Prisma.sql`
        SELECT m.id FROM "cash_movements" m JOIN "shifts" s ON s.id = m."shiftId"
        WHERE s."businessId" = ${ctx.businessId} AND m."occurredAt" >= ${ctx.startInstant}`, cursor);
      cursor = ids[ids.length - 1] ?? cursor;
      if (!ids.length) return;
      const movements = await this.prisma.cashMovement.findMany({ where: { id: { in: ids } }, include: { shift: { select: { terminalId: true, storeId: true } } }, orderBy: { occurredAt: "asc" } });
      for (const m of movements) {
        const date = localDateTime(m.occurredAt, ctx.zoneOf(m.shift.storeId)).date;
        const ref: SourceRef = { type: "CASH_MOVEMENT", id: m.id, documentNo: null, date };
        // Cash moving within Caixa principal (no till of its own) changes nothing in the books.
        if (!ctx.cashPerTill || !m.shift.terminalId) {
          await this.skip(ctx, ref);
          continue;
        }
        await this.postPlan(
          ctx,
          [ref],
          () => cashMovementPlan({ terminalId: m.shift.terminalId, tillName: ctx.tillName(m.shift.terminalId, m.shift.storeId), type: m.type, reason: m.reason, date, amount: m.amount }, ctx.resolver),
          m.userId,
        );
      }
      if (ids.length < BATCH) return;
    }
  }

  private async stockAdjustments(ctx: RunContext) {
    let cursor = "";
    for (;;) {
      const ids = await this.pendingIds(ctx, "STOCK_ADJUSTMENT", Prisma.sql`
        SELECT m.id FROM "stock_movements" m JOIN "stores" s ON s.id = m."storeId"
        WHERE s."businessId" = ${ctx.businessId} AND m.type = 'ADJUSTMENT' AND m."occurredAt" >= ${ctx.startInstant}`, cursor);
      cursor = ids[ids.length - 1] ?? cursor;
      if (!ids.length) return;
      const movements = await this.prisma.stockMovement.findMany({
        where: { id: { in: ids } },
        include: { product: { select: { name: true } }, store: { select: { name: true } } },
        orderBy: { occurredAt: "asc" },
      });
      for (const m of movements) {
        const date = localDateTime(m.occurredAt, ctx.zoneOf(m.storeId)).date;
        const ref: SourceRef = { type: "STOCK_ADJUSTMENT", id: m.id, documentNo: null, date };
        const value = m.quantity.times(m.unitCost).toDecimalPlaces(2);
        if (value.isZero()) {
          await this.skip(ctx, ref);
          continue;
        }
        await this.postPlan(ctx, [ref], () => stockAdjustmentPlan({ productName: m.product.name, storeName: m.store.name, date, value }, ctx.resolver), m.userId ?? undefined);
      }
      if (ids.length < BATCH) return;
    }
  }

  // ---------------------------------------------------------------- posting

  /** Source ids of a kind with no link yet, in pages (ids after `after`): every record is tried once per run. */
  private async pendingIds(ctx: RunContext, type: SourceType, select: Prisma.Sql, after: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT src.id FROM (${select}) src
      WHERE src.id > ${after}
        AND NOT EXISTS (SELECT 1 FROM "accounting_source_links" l WHERE l."businessId" = ${ctx.businessId} AND l."sourceType" = ${type} AND l."sourceId" = src.id)
      ORDER BY src.id
      LIMIT ${BATCH}`;
    return rows.map((r) => r.id);
  }

  private async postPlan(ctx: RunContext, refs: SourceRef[], plan: () => PostingPlan, sourceUserId?: string, transactionDate?: string) {
    let p: PostingPlan;
    try {
      p = plan();
    } catch (error) {
      for (const ref of refs) await this.recordError(ctx, ref, error);
      return;
    }
    await this.withLinks(ctx, refs, (tx) =>
      this.entries.post(
        {
          businessId: ctx.businessId,
          journalKind: p.journalKind,
          transactionDate: transactionDate ?? p.date,
          postingDate: p.date,
          description: p.description,
          sourceUserId: sourceUserId ?? ctx.userId,
          customerId: p.customerId ?? null,
          supplierId: p.supplierId ?? null,
          origin: "AUTO",
          lines: p.lines as LineInput[],
        },
        tx,
      ),
    );
  }

  /** Posts and links in one transaction; a link already there means another run posted it (rolled back here). */
  private async withLinks(ctx: RunContext, refs: SourceRef[], post: (tx: Prisma.TransactionClient) => Promise<{ id: string }>) {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const entry = await post(tx);
          await tx.accountingSourceLink.createMany({
            data: refs.map((r) => ({ businessId: ctx.businessId, sourceType: r.type, sourceId: r.id, entryId: entry.id, skipped: false, documentNo: r.documentNo, documentDate: dateValue(r.date) })),
          });
          // Same reason as in EntriesService.post: make a breach an error here, not a silent rollback at COMMIT.
          await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
        },
        { timeout: 60_000 },
      );
      await this.prisma.accountingIntegrationError.deleteMany({ where: { businessId: ctx.businessId, OR: refs.map((r) => ({ sourceType: r.type, sourceId: r.id })) } });
      ctx.result.posted += refs.length;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
      for (const ref of refs) await this.recordError(ctx, ref, error);
    }
  }

  private async skip(ctx: RunContext, ref: SourceRef) {
    try {
      await this.prisma.accountingSourceLink.create({
        data: { businessId: ctx.businessId, sourceType: ref.type, sourceId: ref.id, skipped: true, documentNo: ref.documentNo, documentDate: dateValue(ref.date) },
      });
      await this.prisma.accountingIntegrationError.deleteMany({ where: { businessId: ctx.businessId, sourceType: ref.type, sourceId: ref.id } });
      ctx.result.skipped++;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }

  private async recordError(ctx: RunContext, ref: SourceRef, error: unknown) {
    const message =
      error instanceof MappingError || error instanceof HttpException
        ? error.message
        : error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError
          ? (/ERROR: ([^\n]+)/.exec(error.message)?.[1] ?? error.message)
          : String(error);
    if (!(error instanceof MappingError || error instanceof BadRequestException)) this.logger.warn(`Accounting integration ${ref.type} ${ref.id}: ${message}`);
    await this.prisma.accountingIntegrationError.upsert({
      where: { businessId_sourceType_sourceId: { businessId: ctx.businessId, sourceType: ref.type, sourceId: ref.id } },
      create: { businessId: ctx.businessId, sourceType: ref.type, sourceId: ref.id, documentNo: ref.documentNo, documentDate: dateValue(ref.date), message: message.slice(0, 500) },
      update: { message: message.slice(0, 500), attempts: { increment: 1 }, lastTriedAt: new Date(), documentDate: dateValue(ref.date) },
    });
    ctx.result.failed++;
  }

  // ---------------------------------------------------------------- monitor

  /**
   * What isn't posted yet, per kind (all of it, or dated in [from, to]),
   * and the errors. Today's till documents wait for tomorrow in a daily
   * summary and are counted as waiting, not missing.
   */
  async pending(businessId: string, range?: { from: string; to: string }) {
    const settings = await this.prisma.accountingSettings.findUnique({ where: { businessId } });
    if (!settings) return { counts: {} as Record<SourceType, number>, total: 0 };
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const tz = businessTimeZone(business);
    const start = isoDate(settings.startDate);
    const from = range && range.from > start ? range.from : start;
    const to = range?.to ?? "9999-12-31";
    const fromInstant = startOfLocalDay(from, tz);
    const toInstant = to === "9999-12-31" ? new Date(Date.UTC(9999, 0, 1)) : startOfLocalDay(addDay(to), tz);
    const notLinked = (type: SourceType, alias: string) =>
      Prisma.sql`NOT EXISTS (SELECT 1 FROM "accounting_source_links" l WHERE l."businessId" = ${businessId} AND l."sourceType" = ${type} AND l."sourceId" = ${Prisma.raw(alias)}.id)`;
    const count = async (sql: Prisma.Sql) => Number((await this.prisma.$queryRaw<{ n: bigint }[]>(sql))[0].n);
    const counts: Record<string, number> = {
      FISCAL_DOCUMENT: await count(Prisma.sql`SELECT count(*) AS n FROM "fiscal_documents" d WHERE d."businessId" = ${businessId} AND d."documentType" IN (${Prisma.join(POSTED_DOCUMENT_TYPES)}) AND d."invoiceDate" BETWEEN ${dateValue(from)} AND ${dateValue(to)} AND ${notLinked("FISCAL_DOCUMENT", "d")}`),
      FISCAL_DOCUMENT_ANNULMENT: await count(Prisma.sql`
        SELECT count(*) AS n FROM "accounting_source_links" l JOIN "fiscal_documents" d ON d.id = l."sourceId"
        WHERE l."businessId" = ${businessId} AND l."sourceType" = 'FISCAL_DOCUMENT' AND l.skipped = false AND d.status = 'A' AND d."statusDate" >= ${fromInstant} AND d."statusDate" < ${toInstant}
          AND NOT EXISTS (SELECT 1 FROM "accounting_source_links" a WHERE a."businessId" = l."businessId" AND a."sourceType" = 'FISCAL_DOCUMENT_ANNULMENT' AND a."sourceId" = l."sourceId")`),
      PURCHASE: await count(Prisma.sql`SELECT count(*) AS n FROM "purchases" p JOIN "stores" s ON s.id = p."storeId" WHERE s."businessId" = ${businessId} AND p.status <> 'CANCELLED' AND p."createdAt" >= ${fromInstant} AND p."createdAt" < ${toInstant} AND ${notLinked("PURCHASE", "p")}`),
      SUPPLIER_PAYMENT: await count(Prisma.sql`SELECT count(*) AS n FROM "supplier_payments" p WHERE p."businessId" = ${businessId} AND p."paidOn" BETWEEN ${dateValue(from)} AND ${dateValue(to)} AND ${notLinked("SUPPLIER_PAYMENT", "p")}`),
      EXPENSE: await count(Prisma.sql`SELECT count(*) AS n FROM "expenses" e JOIN "stores" s ON s.id = e."storeId" WHERE s."businessId" = ${businessId} AND e."incurredAt" >= ${fromInstant} AND e."incurredAt" < ${toInstant} AND ${notLinked("EXPENSE", "e")}`),
      SHIFT_DIFFERENCE: await count(Prisma.sql`SELECT count(*) AS n FROM "shifts" s WHERE s."businessId" = ${businessId} AND s.status = 'CLOSED' AND s.difference <> 0 AND s."closedAt" >= ${fromInstant} AND s."closedAt" < ${toInstant} AND ${notLinked("SHIFT_DIFFERENCE", "s")}`),
      CASH_MOVEMENT: await count(Prisma.sql`SELECT count(*) AS n FROM "cash_movements" m JOIN "shifts" s ON s.id = m."shiftId" WHERE s."businessId" = ${businessId} AND m."occurredAt" >= ${fromInstant} AND m."occurredAt" < ${toInstant} AND ${notLinked("CASH_MOVEMENT", "m")}`),
      STOCK_ADJUSTMENT: await count(Prisma.sql`SELECT count(*) AS n FROM "stock_movements" m JOIN "stores" s ON s.id = m."storeId" WHERE s."businessId" = ${businessId} AND m.type = 'ADJUSTMENT' AND m."occurredAt" >= ${fromInstant} AND m."occurredAt" < ${toInstant} AND ${notLinked("STOCK_ADJUSTMENT", "m")}`),
    };
    return { counts: counts as Record<SourceType, number>, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  }

  async monitor(businessId: string) {
    const [pending, errors, lastPosted, posted] = await Promise.all([
      this.pending(businessId),
      this.prisma.accountingIntegrationError.findMany({ where: { businessId }, orderBy: [{ documentDate: "asc" }], take: 200 }),
      this.prisma.journalEntry.findFirst({ where: { businessId, origin: "AUTO" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      this.prisma.accountingSourceLink.count({ where: { businessId, skipped: false } }),
    ]);
    return {
      pending: pending.counts,
      pendingTotal: pending.total,
      postedTotal: posted,
      lastPostedAt: lastPosted?.createdAt ?? null,
      running: this.running.has(businessId),
      errors: errors.map((e) => ({ sourceType: e.sourceType, sourceId: e.sourceId, documentNo: e.documentNo, documentDate: isoDate(e.documentDate), message: e.message, attempts: e.attempts, lastTriedAt: e.lastTriedAt })),
    };
  }
}

function addDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
