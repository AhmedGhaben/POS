import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { SaftFacturacaoSummaryDto } from "@pos/shared";
import { createHash } from "crypto";
import { buildXlsx } from "../common/xlsx";
import { CustomerAccountsService } from "../accounts/customer-accounts.service";
import { countryConfig } from "../countries";
import { PrismaService } from "../prisma/prisma.service";
import { fiscalTimeZone, localDateTime } from "./fiscal-format";
import { FiscalService } from "./fiscal.service";
import { AccountantMoneyMovement, AccountantPurchase, AccountantSale, AccountantTax, accountantSheets } from "./saft/accountant";
import { buildSaftXml, documentsMissingExemption, SaftCustomer, SaftDocument, SaftLine, SaftPayment, SaftProduct, SaftTax, SaftTaxTableEntry, SaftTransaction } from "./saft/facturacao";
import { DRAFT_CSV, inventoryRows, InventoryFormat } from "./saft/inventario";
import { addDays, dateColumnValue, exportPeriod, ExportPeriod, lastYearEnd, localDate, parseCalendarDate, previousMonth, startOfLocalDay } from "./saft/period";

export interface ExportFile {
  fileName: string;
  mimeType: string;
  body: string | Buffer;
}

export interface ExportQuery {
  storeId?: string;
  startDate?: string;
  endDate?: string;
}

/** Sales documents in SalesInvoices; proformas and quotes are working documents. */
const WORKING_TYPES = ["PF", "OR"];
const PAYMENT_TYPES = ["RC", "RG"];
const SAFT_TAX_TYPES = ["IVA", "IS", "NS"];
/** The SAF-T Reason holds 50 characters; wordings longer than that are exported in short. */
const SHORT_ANNULMENT_REASONS: Record<string, string> = { N: "Anulada por não envio do documento ao adquirente" };
const VALIDATION_NUMBER = /^\d+\/AGT\/\d{4}$/;

const PAYMENT_METHOD_NAMES: Record<string, string> = {
  CASH: "Numerário",
  CARD: "Multicaixa (TPA)",
  CREDIT_CARD: "Cartão de crédito",
  MULTICAIXA_REFERENCE: "Referência Multicaixa",
  BANK_TRANSFER: "Transferência bancária",
  CHEQUE: "Cheque",
  MOBILE_MONEY: "Dinheiro móvel",
  OTHER: "Outro",
};
const PURCHASE_STATUS_NAMES: Record<string, string> = { PENDING: "Pendente", RECEIVED: "Recebida", CANCELLED: "Cancelada" };
const PURCHASE_PAYMENT_NAMES: Record<string, string> = { UNPAID: "Por pagar", PARTIAL: "Parcialmente pago", PAID: "Pago" };

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const dateOf = (d: Date) => d.toISOString().slice(0, 10);

type DocumentWithLines = Prisma.FiscalDocumentGetPayload<{ include: { lines: { include: { taxes: true } }; series: { select: { code: true } } } }>;

/**
 * The SAF-T (AO) files and the accountant export (docs/plans/ANGOLA.md,
 * phase 8b). Periods are plain calendar dates in the store's time zone
 * (saft/period.ts); every file generated is in the audit log.
 */
@Injectable()
export class SaftExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscal: FiscalService,
    private readonly accounts: CustomerAccountsService,
  ) {}

  /** SAF-T (AO) Facturação: the period's sales documents, working documents and receipts. */
  async facturacao(businessId: string, userId: string, query: ExportQuery, now = new Date()): Promise<ExportFile> {
    const ctx = await this.context(businessId, query.storeId);
    const nif = this.requireNif(ctx.business.taxId);
    if (ctx.business.currency !== "AOA") {
      throw new BadRequestException("SAF-T (AO) files are in kwanzas: set the business currency to AOA first");
    }
    const period = this.period(query, ctx.timeZone, now, true);
    const parts = await this.invoicing(ctx, period, { customerIds: [], supplierIds: [] });
    const xml = buildSaftXml({
      ...this.header(ctx, nif, period, now),
      taxEntity: ctx.store ? ctx.store.name : "Global",
      ...parts.input,
    });

    await this.logExport(businessId, userId, "SAFT_FACTURACAO", {
      startDate: period.startDate,
      endDate: period.endDate,
      storeId: ctx.store?.id ?? null,
      documents: parts.documents,
      purchases: parts.purchases,
    });
    return {
      fileName: `SAFT-AO_${nif}_${period.startDate}_${period.endDate}${ctx.store ? `_${this.fileSafe(ctx.store.name)}` : ""}.xml`,
      mimeType: "application/xml; charset=utf-8",
      body: xml,
    };
  }

  /**
   * How many documents the invoicing file for a period would hold, before
   * generating it: the same period, store and documents as facturacao().
   */
  async facturacaoSummary(businessId: string, query: ExportQuery, now = new Date()): Promise<SaftFacturacaoSummaryDto> {
    const ctx = await this.context(businessId, query.storeId);
    const period = this.period(query, ctx.timeZone, now, true);
    const byType = await this.prisma.fiscalDocument.groupBy({ by: ["documentType"], where: this.documentsWhere(ctx, period), _count: true });
    const count = (types: (t: string) => boolean) => byType.filter((r) => types(r.documentType)).reduce((n, r) => n + r._count, 0);
    const workingDocuments = count((t) => WORKING_TYPES.includes(t));
    const payments = count((t) => PAYMENT_TYPES.includes(t));
    const salesInvoices = count((t) => !WORKING_TYPES.includes(t) && !PAYMENT_TYPES.includes(t));
    return { startDate: period.startDate, endDate: period.endDate, salesInvoices, workingDocuments, payments, total: salesInvoices + workingDocuments + payments };
  }

  /**
   * SAF-T (AO) Aquisição de Bens e Serviços (TaxAccountingBasis "A", Decreto
   * Presidencial 312/18, art. 3): the period's purchases with the supplier's
   * document, the suppliers and the tax table; due monthly for the month
   * before (docs/ACCOUNTING-DECISIONS.md, Q1).
   */
  async aquisicao(businessId: string, userId: string, query: ExportQuery, now = new Date()): Promise<ExportFile> {
    const ctx = await this.context(businessId, query.storeId);
    const nif = this.requireNif(ctx.business.taxId);
    if (ctx.business.currency !== "AOA") {
      throw new BadRequestException("SAF-T (AO) files are in kwanzas: set the business currency to AOA first");
    }
    const period = this.period(query, ctx.timeZone, now, true);
    const parts = await this.invoicing(ctx, period, { customerIds: [], supplierIds: [] }, { purchasesOnly: true });
    const xml = buildSaftXml({
      ...this.header(ctx, nif, period, now),
      taxAccountingBasis: "A",
      taxEntity: ctx.store ? ctx.store.name : "Global",
      ...parts.input,
      customers: [],
      products: [],
      salesInvoices: [],
      workingDocuments: [],
      payments: [],
    });
    await this.logExport(businessId, userId, "SAFT_AQUISICAO", { startDate: period.startDate, endDate: period.endDate, storeId: ctx.store?.id ?? null, purchases: parts.purchases });
    return {
      fileName: `SAFT-AO-Aquisicao_${nif}_${period.startDate}_${period.endDate}${ctx.store ? `_${this.fileSafe(ctx.store.name)}` : ""}.xml`,
      mimeType: "application/xml; charset=utf-8",
      body: xml,
    };
  }

  /**
   * SAF-T (AO) Contabilidade, integrated with invoicing (TaxAccountingBasis
   * "I", TaxEntity "Sede"): the chart with opening and closing balances, the
   * year's entries (periods 1-15; the opening only as opening balances) and
   * the invoicing documents with the TransactionID they were posted in.
   * The accounting module checks the books before asking for it.
   */
  async contabilidade(businessId: string, userId: string, year: number, now = new Date()): Promise<ExportFile> {
    const ctx = await this.context(businessId);
    const nif = this.requireNif(ctx.business.taxId);
    if (ctx.business.currency !== "AOA") {
      throw new BadRequestException("SAF-T (AO) files are in kwanzas: set the business currency to AOA first");
    }
    const period = exportPeriod(`${year}-01-01`, `${year}-12-31`, ctx.timeZone, { sameYear: true });
    const ledger = await this.generalLedger(businessId, year, ctx.timeZone);
    const parts = await this.invoicing(ctx, period, { customerIds: ledger.customerIds, supplierIds: ledger.supplierIds });
    const xml = buildSaftXml({
      ...this.header(ctx, nif, period, now),
      taxAccountingBasis: "I",
      taxEntity: "Sede",
      ...parts.input,
      generalLedger: {
        accounts: ledger.accounts,
        journals: ledger.journals.map((j) => ({
          ...j,
          transactions: j.transactions.map((t) => ({ ...t, customerId: t.customerId ? parts.customerIdFor(t.customerId) : null, supplierId: t.supplierId ? parts.supplierIdFor(t.supplierId) : null })),
        })),
      },
    });
    await this.logExport(businessId, userId, "SAFT_CONTABILIDADE", { year, documents: parts.documents, entries: ledger.journals.reduce((n, j) => n + j.transactions.length, 0) });
    return { fileName: `SAFT-AO-Contabilidade_${nif}_${year}.xml`, mimeType: "application/xml; charset=utf-8", body: xml };
  }

  private header(ctx: Awaited<ReturnType<SaftExportService["context"]>>, nif: string, period: ExportPeriod, now: Date) {
    return {
      company: {
        taxId: nif,
        companyId: ctx.business.registrationNumber?.trim() || nif,
        legalName: ctx.business.legalName || ctx.business.name,
        businessName: ctx.business.name,
        address: { detail: ctx.business.address, city: ctx.business.city, postalCode: ctx.business.postalCode, province: this.provinceName(ctx.business.country, ctx.business.province) },
        phone: ctx.business.phone,
        email: ctx.business.email,
        website: ctx.business.website,
      },
      software: this.software(),
      fiscalYear: period.fiscalYear,
      startDate: period.startDate,
      endDate: period.endDate,
      dateCreated: localDateTime(now, ctx.timeZone).date,
    };
  }

  /**
   * The invoicing part of a file: customers, suppliers, products and taxes,
   * the period's documents, receipts and purchases. With the books kept
   * here, customers and suppliers carry their account (AccountID) and
   * documents the entry they were posted in (TransactionID).
   */
  private async invoicing(
    ctx: Awaited<ReturnType<SaftExportService["context"]>>,
    period: ExportPeriod,
    extra: { customerIds: string[]; supplierIds: string[] },
    opts: { purchasesOnly?: boolean } = {},
  ) {
    const businessId = ctx.business.id;
    const documents = opts.purchasesOnly ? [] : await this.prisma.fiscalDocument.findMany({
      where: this.documentsWhere(ctx, period),
      include: { lines: { include: { taxes: true }, orderBy: { lineNumber: "asc" } }, series: { select: { code: true } } },
    });
    documents.sort(
      (a, b) => a.documentType.localeCompare(b.documentType) || a.series.code.localeCompare(b.series.code) || a.number - b.number,
    );
    const transactions = await this.transactionIds(businessId, documents.map((d) => d.id));

    const zoneOf = (storeId: string) => ctx.storeZones.get(storeId) ?? ctx.timeZone;
    const customers = await this.customersFor(businessId, documents, extra.customerIds);
    const toDoc = (d: DocumentWithLines): SaftDocument => {
      const tz = zoneOf(d.storeId);
      const date = dateOf(d.invoiceDate);
      return {
        documentNo: d.documentNo,
        transactionId: transactions.get(d.id) ?? null,
        documentType: d.documentType,
        status: d.status,
        statusDateTime: localDateTime(d.statusDate, tz).dateTime,
        statusReason: d.statusReasonCode && (d.statusReason?.length ?? 0) > 50 ? (SHORT_ANNULMENT_REASONS[d.statusReasonCode] ?? d.statusReason) : d.statusReason,
        statusSourceId: d.statusById ?? d.sourceId,
        sourceBilling: d.sourceBilling,
        hash: d.hash,
        hashControl: d.hashControl,
        period: d.period,
        date,
        systemEntryDateTime: localDateTime(d.systemEntryDate, tz).dateTime,
        sourceId: d.sourceId,
        customerId: customers.idFor(d.customerId),
        lines: d.lines.map((l): SaftLine => {
          const t = l.taxes.find((x) => SAFT_TAX_TYPES.includes(x.taxType));
          return {
            lineNumber: l.lineNumber,
            productCode: l.productCode,
            description: l.productDescription,
            quantity: l.quantity,
            unit: l.unit,
            unitPrice: l.unitPrice,
            netAmount: l.netAmount,
            tax: t ? { type: t.taxType, region: t.taxCountryRegion, code: t.taxCode, percentage: t.percentage } : { type: "NS", region: "AO", code: "NS", percentage: D(0) },
            exemption: t?.exemptionCode && t.exemptionReason ? { code: t.exemptionCode, reason: t.exemptionReason } : null,
            settlementAmount: l.discountAmount,
            reference: d.documentType === "NC" && l.referenceDocumentNo ? { documentNo: l.referenceDocumentNo, reason: d.reason } : null,
          };
        }),
        taxPayable: d.taxPayable,
        netTotal: d.netTotal,
        grossTotal: d.grossTotal,
        payments:
          d.documentType === "FR"
            ? this.paymentsOf(d).map((p) => ({ mechanism: p.mechanism, amount: D(p.amount), date }))
            : [],
      };
    };

    const sales = documents.filter((d) => !WORKING_TYPES.includes(d.documentType) && !PAYMENT_TYPES.includes(d.documentType));
    const working = documents.filter((d) => WORKING_TYPES.includes(d.documentType));
    const payments = (await this.receiptsFor(documents.filter((d) => PAYMENT_TYPES.includes(d.documentType)), zoneOf, customers.idFor)).map((p) => ({
      ...p,
      transactionId: transactions.get(documents.find((d) => d.documentNo === p.paymentRefNo)?.id ?? "") ?? null,
    }));
    // Purchases with the supplier's document, by the document's date.
    const purchases = await this.prisma.purchase.findMany({
      where: {
        store: { businessId },
        ...(ctx.store ? { storeId: ctx.store.id } : {}),
        status: { not: "CANCELLED" },
        supplierDocNo: { not: null },
        supplierDocDate: { gte: dateColumnValue(period.startDate), lte: dateColumnValue(period.endDate) },
      },
      include: { supplier: true, taxLines: true },
      orderBy: [{ supplierDocDate: "asc" }, { createdAt: "asc" }],
    });
    const supplierRows = [...new Map(purchases.map((p) => [p.supplier.id, p.supplier])).values()];
    const missingSuppliers = extra.supplierIds.filter((id) => !supplierRows.some((s) => s.id === id));
    if (missingSuppliers.length) supplierRows.push(...(await this.prisma.supplier.findMany({ where: { businessId, id: { in: missingSuppliers } } })));
    const supplierAccounts = await this.ledgerAccountsOf(businessId, "SUPPLIER", supplierRows.map((s) => s.id));
    const supplierIdFor = (id: string) => (id.length <= 30 ? id : `S${createHash("sha1").update(id).digest("hex").slice(0, 29)}`);
    // Never a file with an exempt line lacking its M-code (only documents from before that rule).
    const missing = documentsMissingExemption([...sales, ...working].map(toDoc));
    if (missing.length) {
      const shown = missing.slice(0, 10).join(", ") + (missing.length > 10 ? ` (+${missing.length - 10})` : "");
      throw new BadRequestException(`Documents with an exempt line without an exemption reason: ${shown}`);
    }
    return {
      documents: documents.length,
      purchases: purchases.length,
      customerIdFor: customers.idFor,
      supplierIdFor,
      input: {
        customers: customers.list,
        suppliers: supplierRows.map((s) => ({
          id: supplierIdFor(s.id),
          accountId: supplierAccounts.get(s.id) ?? null,
          taxId: s.taxId?.trim() || "999999999",
          name: s.name,
          contact: s.contactName,
          address: { detail: s.address, city: s.city, postalCode: s.postalCode, province: this.provinceName(s.country, s.province), country: s.country },
          phone: s.phone,
          email: s.email,
        })),
        products: await this.productsFor(businessId, documents),
        taxTable: await this.taxTableFor(businessId, documents),
        salesInvoices: sales.map(toDoc),
        workingDocuments: working.map(toDoc),
        payments,
        purchaseInvoices: purchases.map((p) => ({
          invoiceNo: p.supplierDocNo!,
          hash: p.supplierDocHash || "0",
          sourceId: p.createdById,
          period: p.supplierDocDate!.getUTCMonth() + 1,
          date: dateOf(p.supplierDocDate!),
          purchaseType: p.supplierDocType ?? "FT",
          supplierId: supplierIdFor(p.supplier.id),
          taxPayable: p.taxTotal,
          netTotal: p.subtotal,
          grossTotal: p.total,
          deductible: p.taxLines.map((t) => ({ taxBase: t.base, amount: t.deductibleAmount, percentage: t.deductiblePercent, type: t.typology })),
          withholding: p.withholdingPercent ? { percent: p.withholdingPercent, amount: p.withholdingAmount } : null,
        })),
      },
    };
  }

  /** The entry each document was posted in (accounting kept here), as its SAF-T TransactionID. */
  private async transactionIds(businessId: string, documentIds: string[]): Promise<Map<string, string>> {
    if (!documentIds.length) return new Map();
    const links = await this.prisma.accountingSourceLink.findMany({
      where: { businessId, sourceType: "FISCAL_DOCUMENT", sourceId: { in: documentIds }, skipped: false },
      select: { sourceId: true, entry: { select: { transactionId: true } } },
    });
    return new Map(links.filter((l) => l.entry).map((l) => [l.sourceId, l.entry!.transactionId]));
  }

  /** The chart accounts the books keep for customers or suppliers (AccountID). */
  private async ledgerAccountsOf(businessId: string, linkType: "CUSTOMER" | "SUPPLIER", ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.ledgerAccount.findMany({ where: { businessId, linkType, linkId: { in: ids } }, select: { linkId: true, code: true } });
    return new Map(rows.map((r) => [r.linkId!, r.code]));
  }

  /**
   * The chart (every account, with debit and credit balances at the start
   * of the year and at its end; aggregating accounts show their
   * sub-accounts' debit and credit balances side by side) and the year's
   * entries by journal (periods 1-15).
   */
  private async generalLedger(businessId: string, year: number, timeZone: string) {
    const accounts = await this.prisma.ledgerAccount.findMany({ where: { businessId } });
    const sums = async (fromPeriod: number, toPeriod: number) => {
      const rows = await this.prisma.$queryRaw<{ accountId: string; balance: Prisma.Decimal }[]>`
        SELECT l."accountId", SUM(l.debit) - SUM(l.credit) AS balance
        FROM "journal_entry_lines" l JOIN "journal_entries" e ON e.id = l."entryId"
        WHERE e."businessId" = ${businessId} AND e.year = ${year} AND e.period BETWEEN ${fromPeriod} AND ${toPeriod}
        GROUP BY l."accountId"`;
      return new Map(rows.map((r) => [r.accountId, D(r.balance)]));
    };
    const opening = await sums(0, 0);
    const closing = await sums(0, 15);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    // Debit and credit balances rolled up to every ancestor.
    const rollup = (balances: Map<string, Prisma.Decimal>) => {
      const out = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
      for (const [id, b] of balances) {
        for (let a = byId.get(id); a; a = a.parentId ? byId.get(a.parentId) : undefined) {
          const t = out.get(a.id) ?? { debit: D(0), credit: D(0) };
          if (b.gt(0)) t.debit = t.debit.plus(b);
          else t.credit = t.credit.minus(b);
          out.set(a.id, t);
        }
      }
      return out;
    };
    const open = rollup(opening);
    const close = rollup(closing);
    const codeOf = (id: string | null) => (id ? (byId.get(id)?.code ?? null) : null);
    const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    const ledgerAccounts = sorted.map((a) => ({
      id: a.code,
      description: a.name,
      openingDebit: open.get(a.id)?.debit ?? D(0),
      openingCredit: open.get(a.id)?.credit ?? D(0),
      closingDebit: close.get(a.id)?.debit ?? D(0),
      closingCredit: close.get(a.id)?.credit ?? D(0),
      category: a.category,
      groupingCode: codeOf(a.parentId),
    }));

    const entries = await this.prisma.journalEntry.findMany({
      where: { businessId, year, period: { gte: 1, lte: 15 } },
      include: { journal: true, lines: { orderBy: { lineNumber: "asc" } } },
      orderBy: [{ journal: { code: "asc" } }, { number: "asc" }],
    });
    const journals = new Map<string, { id: string; description: string; transactions: SaftTransaction[] }>();
    for (const e of entries) {
      const j = journals.get(e.journalId) ?? { id: e.journal.code, description: e.journal.name, transactions: [] };
      const at = localDateTime(e.systemEntryDate, timeZone).dateTime;
      j.transactions.push({
        id: e.transactionId,
        period: e.period,
        date: dateOf(e.transactionDate),
        sourceId: e.sourceUserId,
        description: e.description,
        docArchivalNumber: e.docArchivalNumber,
        type: e.transactionType,
        postingDate: dateOf(e.postingDate),
        customerId: e.customerId,
        supplierId: e.customerId ? null : e.supplierId,
        lines: e.lines.map((l) => ({
          recordId: l.id,
          accountId: codeOf(l.accountId)!,
          sourceDocumentId: l.sourceDocumentId,
          systemEntryDateTime: at,
          description: l.description,
          debit: l.debit.gt(0) ? l.debit : null,
          credit: l.credit.gt(0) ? l.credit : null,
        })),
      });
      journals.set(e.journalId, j);
    }
    return {
      accounts: ledgerAccounts,
      journals: [...journals.values()],
      customerIds: [...new Set(entries.map((e) => e.customerId).filter((id): id is string => !!id))],
      supplierIds: [...new Set(entries.filter((e) => !e.customerId).map((e) => e.supplierId).filter((id): id is string => !!id))],
    };
  }

  /**
   * SAF-T de Inventários (draft format): stock held at the end of `date`
   * (default 31 December of last year) by each store's clock, at its
   * weighted average cost, summed across stores.
   */
  async inventario(businessId: string, userId: string, query: { storeId?: string; date?: string }, now = new Date(), format: InventoryFormat = DRAFT_CSV): Promise<ExportFile> {
    const ctx = await this.context(businessId, query.storeId);
    const nif = this.requireNif(ctx.business.taxId);
    const date = query.date ? parseCalendarDate(query.date) : lastYearEnd(now, ctx.timeZone);
    const stores = ctx.store ? [ctx.store] : ctx.stores;

    const perStore: { productId: string; quantity: Prisma.Decimal; averageCost: Prisma.Decimal }[] = [];
    for (const store of stores) {
      // The stock after the store's last movement before the next day began there.
      const until = startOfLocalDay(addDays(date, 1), ctx.storeZones.get(store.id) ?? ctx.timeZone);
      const rows = await this.prisma.$queryRaw<{ productId: string; balance: Prisma.Decimal; averageCost: Prisma.Decimal }[]>(Prisma.sql`
        SELECT DISTINCT ON ("productId") "productId", "balance", "averageCost"
        FROM "stock_movements"
        WHERE "storeId" = ${store.id} AND "occurredAt" < ${until}
        ORDER BY "productId", "occurredAt" DESC, "id" DESC`);
      for (const r of rows) perStore.push({ productId: r.productId, quantity: D(r.balance), averageCost: D(r.averageCost) });
    }
    const products = await this.prisma.product.findMany({
      where: { businessId, trackStock: true, id: { in: [...new Set(perStore.map((s) => s.productId))] } },
      select: { id: true, sku: true, name: true, barcode: true, unit: true, inventoryType: true },
    });
    const rows = inventoryRows(perStore, new Map(products.map((p) => [p.id, p])));
    const body = format.write({ date, companyTaxId: nif, costingMethod: "CMP", rows });

    await this.logExport(businessId, userId, "SAFT_INVENTARIO", { date, storeId: ctx.store?.id ?? null, format: format.id, products: rows.length });
    return {
      fileName: `SAFT-AO-Inventario_${nif}_${date}${ctx.store ? `_${this.fileSafe(ctx.store.name)}` : ""}.${format.extension}`,
      mimeType: format.mimeType,
      body,
    };
  }

  /** Excel workbook for the accountant: sales, purchases, money in and out for the period. */
  async accountant(businessId: string, userId: string, query: ExportQuery, now = new Date()): Promise<ExportFile> {
    const ctx = await this.context(businessId, query.storeId);
    const period = this.period(query, ctx.timeZone, now, false);
    const storeName = new Map(ctx.stores.map((s) => [s.id, s.name]));
    const storeFilter = ctx.store ? { storeId: ctx.store.id } : {};

    const documents = await this.prisma.fiscalDocument.findMany({
      where: {
        businessId,
        ...storeFilter,
        documentType: { notIn: [...WORKING_TYPES, ...PAYMENT_TYPES] },
        invoiceDate: { gte: dateColumnValue(period.startDate), lte: dateColumnValue(period.endDate) },
      },
      include: { lines: { include: { taxes: true } } },
      orderBy: [{ invoiceDate: "asc" }, { systemEntryDate: "asc" }],
    });
    // What's left to pay on each invoice (FT) on credit.
    const ftCustomers = [...new Set(documents.filter((d) => d.documentType === "FT" && d.customerId).map((d) => d.customerId!))];
    const invoiceState = new Map(
      (await this.accounts.invoices(this.prisma, businessId, ftCustomers, { openOnly: false })).map((i) => [i.id, i]),
    );
    const ftStatus = (id: string) => {
      const i = invoiceState.get(id);
      if (!i || i.open.isZero()) return "Pago";
      return i.open.lt(i.grossTotal) ? "Parcialmente pago" : "Por pagar";
    };
    const sales: AccountantSale[] = documents.map((d) => {
      const taxes = new Map<string, AccountantTax>();
      for (const l of d.lines) {
        const t = l.taxes.find((x) => x.taxType === "IVA") ?? l.taxes[0];
        const key = t ? `${t.taxCode}|${t.percentage}|${t.taxCountryRegion}|${t.exemptionCode ?? ""}` : "NS";
        const sum = taxes.get(key) ?? { code: t?.taxCode ?? "NS", percentage: t?.percentage ?? D(0), region: t?.taxCountryRegion ?? "AO", base: D(0), tax: D(0), exemptionCode: t?.exemptionCode };
        sum.base = sum.base.plus(l.netAmount);
        sum.tax = sum.tax.plus(t?.amount ?? 0);
        taxes.set(key, sum);
      }
      return {
        date: dateOf(d.invoiceDate),
        documentNo: d.documentNo,
        documentType: d.documentType,
        status: d.status,
        store: storeName.get(d.storeId) ?? "",
        buyerTaxId: d.buyerTaxId,
        buyerName: d.buyerName,
        taxes: [...taxes.values()],
        netTotal: d.netTotal,
        taxPayable: d.taxPayable,
        grossTotal: d.grossTotal,
        paymentStatus: d.documentType === "FR" ? "Pago" : d.documentType === "FT" && d.status === "N" ? ftStatus(d.id) : "",
      };
    });

    const purchaseRows = await this.prisma.purchase.findMany({
      where: { store: { businessId }, ...storeFilter, createdAt: { gte: period.from, lt: period.until } },
      include: { supplier: true, taxLines: true },
      orderBy: { createdAt: "asc" },
    });
    const purchases: AccountantPurchase[] = purchaseRows.map((p) => {
      // A cancelled purchase is listed but adds nothing.
      const k = p.status === "CANCELLED" ? 0 : 1;
      return {
        date: localDate(p.createdAt, ctx.storeZones.get(p.storeId) ?? ctx.timeZone),
        number: p.purchaseNumber,
        supplierDocType: p.supplierDocType,
        supplierDocumentNo: p.supplierDocNo,
        supplierDocDate: p.supplierDocDate ? dateOf(p.supplierDocDate) : null,
        supplierTaxId: p.supplier.taxId ?? "",
        supplierName: p.supplier.name,
        store: storeName.get(p.storeId) ?? "",
        netTotal: p.subtotal.times(k),
        taxTotal: p.taxTotal.times(k),
        total: p.total.times(k),
        status: PURCHASE_STATUS_NAMES[p.status] ?? p.status,
        paymentStatus: k ? (PURCHASE_PAYMENT_NAMES[p.paymentStatus] ?? p.paymentStatus) : "",
        taxLines: p.taxLines.map((t) => ({ base: t.base, taxAmount: t.taxAmount, deductiblePercent: t.deductiblePercent, deductibleAmount: t.deductibleAmount, typology: t.typology })),
        withholdingPercent: p.withholdingPercent,
        withholdingAmount: p.withholdingAmount.times(k),
      };
    });

    const movements: AccountantMoneyMovement[] = [];
    for (const d of documents) {
      if (d.status === "A" || !["FR", "NC"].includes(d.documentType)) continue;
      for (const p of this.paymentsOf(d)) {
        movements.push({
          date: dateOf(d.invoiceDate),
          documentNo: d.documentNo,
          kind: d.documentType === "NC" ? "Reembolso" : "Recebimento",
          taxId: d.buyerTaxId,
          name: d.buyerName,
          method: PAYMENT_METHOD_NAMES[p.method] ?? p.method,
          amount: D(p.amount).times(d.documentType === "NC" ? -1 : 1),
        });
      }
    }
    // Receipts (customers paying their invoices on credit) and payments to suppliers.
    const receipts = await this.prisma.fiscalDocument.findMany({
      where: { businessId, ...storeFilter, documentType: "RC", status: "N", invoiceDate: { gte: dateColumnValue(period.startDate), lte: dateColumnValue(period.endDate) } },
      orderBy: [{ invoiceDate: "asc" }, { systemEntryDate: "asc" }],
    });
    for (const r of receipts) {
      for (const p of this.paymentsOf(r)) {
        movements.push({ date: dateOf(r.invoiceDate), documentNo: r.documentNo, kind: "Recebimento", taxId: r.buyerTaxId, name: r.buyerName, method: PAYMENT_METHOD_NAMES[p.method] ?? p.method, amount: D(p.amount) });
      }
    }
    const supplierPayments = ctx.store
      ? []
      : await this.prisma.supplierPayment.findMany({
          where: { businessId, cancelledAt: null, paidOn: { gte: dateColumnValue(period.startDate), lte: dateColumnValue(period.endDate) } },
          include: { supplier: true },
          orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
        });
    for (const p of supplierPayments) {
      movements.push({
        date: dateOf(p.paidOn),
        documentNo: p.reference ?? "",
        kind: "Pagamento",
        taxId: p.supplier.taxId ?? "",
        name: p.supplier.name,
        method: PAYMENT_METHOD_NAMES[p.method] ?? p.method,
        amount: p.amount.negated(),
      });
    }
    movements.sort((a, b) => a.date.localeCompare(b.date));

    const body = buildXlsx(
      accountantSheets({ companyName: ctx.business.legalName || ctx.business.name, companyTaxId: ctx.business.taxId ?? "", startDate: period.startDate, endDate: period.endDate, sales, purchases, movements }),
    );
    await this.logExport(businessId, userId, "ACCOUNTANT_EXPORT", { startDate: period.startDate, endDate: period.endDate, storeId: ctx.store?.id ?? null, documents: documents.length, purchases: purchases.length });
    return {
      fileName: `Contabilidade_${period.startDate}_${period.endDate}${ctx.store ? `_${this.fileSafe(ctx.store.name)}` : ""}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body,
    };
  }

  /** The period's documents for the invoicing file: by document date, for one store or the whole business. */
  private documentsWhere(ctx: Awaited<ReturnType<SaftExportService["context"]>>, period: ExportPeriod): Prisma.FiscalDocumentWhereInput {
    return {
      businessId: ctx.business.id,
      ...(ctx.store ? { storeId: ctx.store.id } : {}),
      invoiceDate: { gte: dateColumnValue(period.startDate), lte: dateColumnValue(period.endDate) },
    };
  }

  private async context(businessId: string, storeId?: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException("Business not found");
    const stores = await this.prisma.store.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } });
    const store = storeId ? stores.find((s) => s.id === storeId) : undefined;
    if (storeId && !store) throw new NotFoundException("Store not found");
    const countryZone = countryConfig(store?.country ?? business.country)?.timeZone;
    const storeZones = new Map(stores.map((s) => [s.id, fiscalTimeZone(s.timezone, countryConfig(s.country)?.timeZone ?? countryZone)]));
    // A store's file is in its own zone; the whole business's in the country's.
    const timeZone = store ? storeZones.get(store.id)! : fiscalTimeZone(null, countryZone);
    return { business, stores, store, storeZones, timeZone };
  }

  /** Both dates, or neither (then last month, by the shop's clock). */
  private period(query: ExportQuery, timeZone: string, now: Date, sameYear: boolean): ExportPeriod {
    const { startDate, endDate } = query.startDate || query.endDate ? query : previousMonth(now, timeZone);
    return exportPeriod(startDate, endDate, timeZone, { sameYear });
  }

  private requireNif(taxId: string | null): string {
    const nif = taxId?.replace(/\s+/g, "") ?? "";
    if (nif.length < 10 || nif.length > 15) {
      throw new BadRequestException("Add the company's NIF (10 to 15 characters) in Settings before exporting SAF-T files");
    }
    return nif;
  }

  private software() {
    const certificate = this.fiscal.certificate();
    return {
      // Placeholders until the software is certified: the producer's NIF and
      // the names AGT registers it under (docs/DECISIONS.md).
      producerTaxId: process.env.SAFT_PRODUCER_TAX_ID || "999999999",
      productId: process.env.SAFT_PRODUCT_ID || "POS/POS",
      version: process.env.SAFT_PRODUCT_VERSION || "0.2.3",
      validationNumber: certificate && VALIDATION_NUMBER.test(certificate) ? certificate : "0",
    };
  }

  private paymentsOf(d: { payments: Prisma.JsonValue }): { method: string; mechanism: string; amount: string }[] {
    return Array.isArray(d.payments) ? (d.payments as { method: string; mechanism: string; amount: string }[]) : [];
  }

  private provinceName(country: string, code: string | null): string | null {
    if (!code) return null;
    return countryConfig(country)?.provinces.find((p) => p.code === code)?.name ?? code;
  }

  private fileSafe(name: string): string {
    return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }

  /** The customers the documents (and entries) name; a document without one is Consumidor Final's. */
  private async customersFor(businessId: string, documents: { customerId: string | null; buyerName: string; buyerTaxId: string }[], extra: string[] = []) {
    const ids = [...new Set([...documents.map((d) => d.customerId).filter((id): id is string => !!id), ...extra])];
    const anonymous = documents.some((d) => !d.customerId);
    const rows = await this.prisma.customer.findMany({ where: { businessId, OR: [{ id: { in: ids } }, ...(anonymous ? [{ isFinalConsumer: true }] : [])] } });
    const finalConsumer = rows.find((c) => c.isFinalConsumer);
    // SAF-T's CustomerID holds 30 characters: Consumidor Final is always
    // "CONSUMIDOR-FINAL" (some were created with longer ids), anything else
    // keeps its id, or a stable digest of it when longer.
    const exportId = (c: { id: string; isFinalConsumer: boolean }) =>
      c.isFinalConsumer ? "CONSUMIDOR-FINAL" : c.id.length <= 30 ? c.id : `C${createHash("sha1").update(c.id).digest("hex").slice(0, 29)}`;
    const exportIds = new Map(rows.map((c) => [c.id, exportId(c)]));
    const fallbackId = "CONSUMIDOR-FINAL";
    const accounts = await this.ledgerAccountsOf(businessId, "CUSTOMER", rows.filter((c) => !c.isFinalConsumer).map((c) => c.id));
    const list: SaftCustomer[] = rows.map((c) => ({
      id: exportId(c),
      accountId: accounts.get(c.id) ?? null,
      taxId: c.taxId?.trim() || "999999999",
      name: c.isFinalConsumer ? "Consumidor Final" : c.name,
      finalConsumer: c.isFinalConsumer,
      address: { detail: c.address, city: c.city, postalCode: c.postalCode, province: this.provinceName(c.country, c.province), country: c.country },
      phone: c.phone,
      email: c.email,
    }));
    if (anonymous && !finalConsumer) list.push({ id: fallbackId, taxId: "999999999", name: "Consumidor Final", finalConsumer: true, address: {} });
    return { list, idFor: (customerId: string | null) => (customerId ? (exportIds.get(customerId) ?? customerId) : fallbackId) };
  }

  /**
   * Receipts (RC) for SAF-T Payments: one line per invoice settled, without
   * tax in the proportion of that invoice (the decree's CreditAmount).
   */
  private async receiptsFor(
    receipts: DocumentWithLines[],
    zoneOf: (storeId: string) => string,
    customerIdFor: (id: string | null) => string,
  ): Promise<SaftPayment[]> {
    const rows = await this.prisma.customerPayment.findMany({
      where: { documentId: { in: receipts.map((r) => r.id) } },
      include: { allocations: { include: { document: { select: { documentNo: true, invoiceDate: true, netTotal: true, grossTotal: true } } } } },
    });
    const byDocument = new Map(rows.map((p) => [p.documentId, p]));
    return receipts.map((r) => {
      const tz = zoneOf(r.storeId);
      const date = dateOf(r.invoiceDate);
      const lines = (byDocument.get(r.id)?.allocations ?? []).map((a, i) => ({
        lineNumber: i + 1,
        originatingOn: a.document.documentNo,
        invoiceDate: dateOf(a.document.invoiceDate),
        amount: a.document.grossTotal.isZero() ? a.amount : a.amount.times(a.document.netTotal).div(a.document.grossTotal).toDecimalPlaces(2),
      }));
      const netTotal = lines.reduce((s, l) => s.add(l.amount), D(0));
      return {
        paymentRefNo: r.documentNo,
        paymentType: "RC",
        period: r.period,
        transactionDate: date,
        status: r.status,
        statusDateTime: localDateTime(r.statusDate, tz).dateTime,
        statusReason: r.statusReason,
        statusSourceId: r.statusById ?? r.sourceId,
        sourceId: r.sourceId,
        systemEntryDateTime: localDateTime(r.systemEntryDate, tz).dateTime,
        customerId: customerIdFor(r.customerId),
        methods: this.paymentsOf(r).map((m) => ({ mechanism: m.mechanism, amount: D(m.amount), date })),
        lines,
        netTotal,
        taxPayable: r.grossTotal.sub(netTotal),
        grossTotal: r.grossTotal,
      };
    });
  }

  /** One product entry per code the lines use (the SKU as sold), with what we know of it now. */
  private async productsFor(businessId: string, documents: DocumentWithLines[]): Promise<SaftProduct[]> {
    const byCode = new Map<string, { productId: string | null; description: string }>();
    for (const d of documents) for (const l of d.lines) if (!byCode.has(l.productCode)) byCode.set(l.productCode, { productId: l.productId, description: l.productDescription });
    const ids = [...new Set([...byCode.values()].map((v) => v.productId).filter((id): id is string => !!id))];
    const products = new Map(
      (await this.prisma.product.findMany({ where: { businessId, id: { in: ids } }, include: { category: { select: { name: true } } } })).map((p) => [p.id, p]),
    );
    return [...byCode.entries()].map(([code, v]) => {
      const p = v.productId ? products.get(v.productId) : undefined;
      return { code, type: p?.productType ?? "P", group: p?.category?.name, description: v.description, numberCode: p?.barcode || code };
    });
  }

  /** The business's active rates and every tax the documents used. */
  private async taxTableFor(businessId: string, documents: DocumentWithLines[]): Promise<SaftTaxTableEntry[]> {
    const rates = await this.prisma.taxRate.findMany({ where: { businessId, active: true } });
    const entries = new Map<string, SaftTaxTableEntry>();
    const key = (t: SaftTax) => `${t.type}|${t.region}|${t.code}|${t.percentage.toFixed(2)}`;
    for (const r of rates) {
      if (!SAFT_TAX_TYPES.includes(r.taxType)) continue;
      const entry = { type: r.taxType, region: r.region, code: r.taxCode, percentage: r.percentage, description: r.name };
      entries.set(key(entry), entry);
    }
    for (const d of documents)
      for (const l of d.lines)
        for (const t of l.taxes) {
          if (!SAFT_TAX_TYPES.includes(t.taxType)) continue;
          const entry = { type: t.taxType, region: t.taxCountryRegion, code: t.taxCode, percentage: t.percentage, description: t.taxCode === "ISE" ? "Isento" : `${t.taxType} ${t.percentage.toString()}%` };
          if (!entries.has(key(entry))) entries.set(key(entry), entry);
        }
    return [...entries.values()];
  }

  private async logExport(businessId: string, userId: string, action: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { businessId, userId, action, entityType: "Export", metadata } });
  }
}
