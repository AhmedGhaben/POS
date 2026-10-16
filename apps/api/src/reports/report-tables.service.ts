import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AgtStatus, Prisma, PurchaseStatus, Role } from "@prisma/client";
import { CustomerAccountsService } from "../accounts/customer-accounts.service";
import { payableOf, SupplierAccountsService } from "../accounts/supplier-accounts.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { countryConfig } from "../countries";
import { fiscalTimeZone } from "../fiscal/fiscal-format";
import { dateColumnValue, exportPeriod, ExportPeriod } from "../fiscal/saft/period";
import { PrismaService } from "../prisma/prisma.service";
import {
  Cell,
  marginPercent,
  money,
  paymentsByMethod,
  quantity,
  REPORT_KEYS,
  ReportKey,
  ReportResult,
  ReportTable,
  SNAPSHOT_REPORTS,
  sumColumns,
  turnoverReceived,
  ZERO,
} from "./report-tables";

/** Sales documents counted as sales (credit notes subtract); proformas and receipts aren't. */
const SALES_TYPES = ["FT", "FR", "NC", "ND"];
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

interface Scope {
  businessId: string;
  storeId: string | null;
  /** Null for the snapshot reports. */
  period: ExportPeriod | null;
  stores: { id: string; name: string; country: string; ivaRegime: string; timezone: string }[];
}

interface SalesLineRow {
  documentType: string;
  invoiceDate: string;
  productId: string | null;
  productCode: string;
  productName: string;
  categoryName: string | null;
  cashierName: string | null;
  quantity: Prisma.Decimal;
  net: Prisma.Decimal;
  tax: Prisma.Decimal;
  gross: Prisma.Decimal;
  cost: Prisma.Decimal;
}

/**
 * The back-office reports (docs/plans/ANGOLA.md, phase 10). Sales come from
 * the fiscal documents (FT, FR, less NC; annulled ones left out), dated by
 * their invoice date, so they agree with the SAF-T file and the
 * accountant's workbook. Dates are the store's calendar days.
 */
@Injectable()
export class ReportTablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomerAccountsService,
    private readonly suppliers: SupplierAccountsService,
  ) {}

  async run(user: AuthenticatedUser, report: string, query: { storeId?: string; startDate?: string; endDate?: string }): Promise<ReportResult> {
    if (!(REPORT_KEYS as readonly string[]).includes(report)) throw new NotFoundException("Unknown report");
    const key = report as ReportKey;
    const scope = await this.scope(user, key, query);
    const tables = await this.build(key, scope);
    return { report: key, startDate: scope.period?.startDate ?? null, endDate: scope.period?.endDate ?? null, storeId: scope.storeId, tables };
  }

  private async scope(user: AuthenticatedUser, key: ReportKey, query: { storeId?: string; startDate?: string; endDate?: string }): Promise<Scope> {
    // The whole business is the owner's view; a manager picks one of their stores (the guard checked access).
    if (!query.storeId && user.role !== Role.OWNER) throw new ForbiddenException("Choose a store");
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: user.businessId }, select: { country: true } });
    const stores = await this.prisma.store.findMany({
      where: { businessId: user.businessId, ...(query.storeId ? { id: query.storeId } : {}) },
      select: { id: true, name: true, country: true, ivaRegime: true, timezone: true },
      orderBy: { createdAt: "asc" },
    });
    if (query.storeId && !stores.length) throw new NotFoundException("Store not found");
    let period: ExportPeriod | null = null;
    if (!SNAPSHOT_REPORTS.includes(key)) {
      if (!query.startDate || !query.endDate) throw new BadRequestException("A start and an end date are needed");
      const countryZone = countryConfig(business.country)?.timeZone;
      // One store: its own zone; the whole business: the country's (as the SAF-T files).
      const tz = query.storeId ? fiscalTimeZone(stores[0].timezone, countryConfig(stores[0].country)?.timeZone ?? countryZone) : fiscalTimeZone(null, countryZone);
      period = exportPeriod(query.startDate, query.endDate, tz);
    }
    return { businessId: user.businessId, storeId: query.storeId ?? null, period, stores };
  }

  private build(key: ReportKey, s: Scope): Promise<ReportTable[]> {
    switch (key) {
      case "salesByDay":
      case "salesByMonth":
        return this.salesByPeriod(s, key === "salesByMonth");
      case "salesByProduct":
        return this.salesByProduct(s);
      case "salesByCategory":
        return this.salesByCategory(s);
      case "salesByCashier":
        return this.salesByCashier(s);
      case "salesByPayment":
        return this.salesByPayment(s);
      case "salesByDocumentType":
        return this.salesByDocumentType(s);
      case "ivaSummary":
        return this.ivaSummary(s);
      case "stockValuation":
        return this.stockValuation(s);
      case "lowStock":
        return this.lowStock(s);
      case "customerBalances":
        return this.customerBalances(s);
      case "supplierBalances":
        return this.supplierBalances(s);
      case "purchases":
        return this.purchases(s);
      case "agtStatus":
        return this.agtStatus(s);
    }
  }

  private storeSql(s: Scope, column: Prisma.Sql) {
    return s.storeId ? Prisma.sql`AND ${column} = ${s.storeId}` : Prisma.empty;
  }

  /**
   * Every line of the period's sales documents, signed (credit notes
   * negative), with its cost: the sale's unit cost for that product when
   * the document came from a sale (or a return of one), else the product's
   * cost price now.
   */
  private async salesLines(s: Scope): Promise<SalesLineRow[]> {
    const p = s.period!;
    return this.prisma.$queryRaw<SalesLineRow[]>(Prisma.sql`
      WITH docs AS (
        SELECT d.id, d."documentType", d."invoiceDate",
               CASE WHEN d."documentType" = 'NC' THEN -1 ELSE 1 END AS sign,
               COALESCE(d."saleId", r."saleId") AS origin_sale,
               COALESCE(sa."cashierId", r."processedById") AS cashier_id
        FROM fiscal_documents d
        LEFT JOIN returns r ON r.id = d."returnId"
        LEFT JOIN sales sa ON sa.id = d."saleId"
        WHERE d."businessId" = ${s.businessId} ${this.storeSql(s, Prisma.sql`d."storeId"`)}
          AND d.status <> 'A'
          AND d."documentType" IN (${Prisma.join(SALES_TYPES)})
          AND d."invoiceDate" BETWEEN ${p.startDate}::date AND ${p.endDate}::date
      ),
      sale_cost AS (
        SELECT sli."saleId", sli."productId",
               SUM(sli.quantity * COALESCE(sli."unitCost", pr."costPrice")) / NULLIF(SUM(sli.quantity), 0) AS unit_cost
        FROM sale_line_items sli
        JOIN products pr ON pr.id = sli."productId"
        WHERE sli."saleId" IN (SELECT origin_sale FROM docs WHERE origin_sale IS NOT NULL)
        GROUP BY sli."saleId", sli."productId"
      )
      SELECT docs."documentType",
             to_char(docs."invoiceDate", 'YYYY-MM-DD') AS "invoiceDate",
             l."productId",
             l."productCode",
             l."productDescription" AS "productName",
             c.name AS "categoryName",
             NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), '') AS "cashierName",
             docs.sign * l.quantity AS quantity,
             docs.sign * l."netAmount" AS net,
             docs.sign * l."taxAmount" AS tax,
             docs.sign * l."grossAmount" AS gross,
             docs.sign * l.quantity * COALESCE(sc.unit_cost, pr."costPrice", 0) AS cost
      FROM docs
      JOIN fiscal_document_lines l ON l."documentId" = docs.id
      LEFT JOIN products pr ON pr.id = l."productId"
      LEFT JOIN categories c ON c.id = pr."categoryId"
      LEFT JOIN sale_cost sc ON sc."saleId" = docs.origin_sale AND sc."productId" = l."productId"
      LEFT JOIN users u ON u.id = docs.cashier_id
    `);
  }

  /** Document counts per group: a credit note counts as a document too. */
  private async salesDocuments(s: Scope) {
    const p = s.period!;
    return this.prisma.$queryRaw<{ id: string; documentType: string; invoiceDate: string; netTotal: Prisma.Decimal; taxPayable: Prisma.Decimal; grossTotal: Prisma.Decimal; cashierName: string | null }[]>(Prisma.sql`
      SELECT d.id, d."documentType", to_char(d."invoiceDate", 'YYYY-MM-DD') AS "invoiceDate",
             CASE WHEN d."documentType" = 'NC' THEN -d."netTotal" ELSE d."netTotal" END AS "netTotal",
             CASE WHEN d."documentType" = 'NC' THEN -d."taxPayable" ELSE d."taxPayable" END AS "taxPayable",
             CASE WHEN d."documentType" = 'NC' THEN -d."grossTotal" ELSE d."grossTotal" END AS "grossTotal",
             NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), '') AS "cashierName"
      FROM fiscal_documents d
      LEFT JOIN returns r ON r.id = d."returnId"
      LEFT JOIN sales sa ON sa.id = d."saleId"
      LEFT JOIN users u ON u.id = COALESCE(sa."cashierId", r."processedById")
      WHERE d."businessId" = ${s.businessId} ${this.storeSql(s, Prisma.sql`d."storeId"`)}
        AND d.status <> 'A'
        AND d."documentType" IN (${Prisma.join(SALES_TYPES)})
        AND d."invoiceDate" BETWEEN ${p.startDate}::date AND ${p.endDate}::date
      ORDER BY d."invoiceDate", d."systemEntryDate"
    `);
  }

  private async salesByPeriod(s: Scope, byMonth: boolean): Promise<ReportTable[]> {
    const groups = new Map<string, { documents: number; net: Prisma.Decimal; tax: Prisma.Decimal; gross: Prisma.Decimal }>();
    for (const d of await this.salesDocuments(s)) {
      const k = byMonth ? d.invoiceDate.slice(0, 7) : d.invoiceDate;
      const g = groups.get(k) ?? { documents: 0, net: ZERO, tax: ZERO, gross: ZERO };
      g.documents += 1;
      g.net = g.net.plus(d.netTotal);
      g.tax = g.tax.plus(d.taxPayable);
      g.gross = g.gross.plus(d.grossTotal);
      groups.set(k, g);
    }
    const rows = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, g]) => ({ period, documents: g.documents, net: money(g.net), tax: money(g.tax), gross: money(g.gross) }));
    return [
      {
        columns: [
          { key: "period", kind: byMonth ? "month" : "date" },
          { key: "documents", kind: "count" },
          { key: "net", kind: "money" },
          { key: "tax", kind: "money" },
          { key: "gross", kind: "money" },
        ],
        rows,
        totals: { period: null, ...sumColumns(rows, ["documents"], "count"), ...sumColumns(rows, ["net", "tax", "gross"]) },
      },
    ];
  }

  private marginTable(groups: Map<string, { label: Record<string, Cell>; quantity: Prisma.Decimal; net: Prisma.Decimal; cost: Prisma.Decimal }>, labelColumns: ReportTable["columns"]): ReportTable {
    const rows = [...groups.values()]
      .sort((a, b) => b.net.comparedTo(a.net))
      .map((g) => ({
        ...g.label,
        quantity: quantity(g.quantity),
        net: money(g.net),
        cost: money(g.cost),
        margin: money(g.net.minus(g.cost)),
        marginPercent: marginPercent(g.net, g.net.minus(g.cost)),
      }));
    const totals = sumColumns(rows, ["net", "cost", "margin"]);
    return {
      columns: [...labelColumns, { key: "quantity", kind: "quantity" }, { key: "net", kind: "money" }, { key: "cost", kind: "money" }, { key: "margin", kind: "money" }, { key: "marginPercent", kind: "percent" }],
      rows,
      totals: { ...Object.fromEntries(labelColumns.map((c) => [c.key, null])), quantity: null, ...totals, marginPercent: marginPercent(String(totals.net), String(totals.margin)) },
    };
  }

  private async salesByProduct(s: Scope): Promise<ReportTable[]> {
    const groups = new Map<string, { label: Record<string, Cell>; quantity: Prisma.Decimal; net: Prisma.Decimal; cost: Prisma.Decimal }>();
    for (const l of await this.salesLines(s)) {
      const k = l.productId ?? `code:${l.productCode}`;
      const g = groups.get(k) ?? { label: { code: l.productCode, product: l.productName, category: l.categoryName }, quantity: ZERO, net: ZERO, cost: ZERO };
      g.quantity = g.quantity.plus(l.quantity);
      g.net = g.net.plus(l.net);
      g.cost = g.cost.plus(l.cost);
      groups.set(k, g);
    }
    return [
      this.marginTable(groups, [
        { key: "code", kind: "text" },
        { key: "product", kind: "text" },
        { key: "category", kind: "text" },
      ]),
    ];
  }

  private async salesByCategory(s: Scope): Promise<ReportTable[]> {
    const groups = new Map<string, { label: Record<string, Cell>; quantity: Prisma.Decimal; net: Prisma.Decimal; cost: Prisma.Decimal }>();
    for (const l of await this.salesLines(s)) {
      const k = l.categoryName ?? "";
      const g = groups.get(k) ?? { label: { category: l.categoryName }, quantity: ZERO, net: ZERO, cost: ZERO };
      g.quantity = g.quantity.plus(l.quantity);
      g.net = g.net.plus(l.net);
      g.cost = g.cost.plus(l.cost);
      groups.set(k, g);
    }
    return [this.marginTable(groups, [{ key: "category", kind: "text" }])];
  }

  private async salesByCashier(s: Scope): Promise<ReportTable[]> {
    const groups = new Map<string, { documents: number; net: Prisma.Decimal; tax: Prisma.Decimal; gross: Prisma.Decimal }>();
    for (const d of await this.salesDocuments(s)) {
      const k = d.cashierName ?? "";
      const g = groups.get(k) ?? { documents: 0, net: ZERO, tax: ZERO, gross: ZERO };
      g.documents += 1;
      g.net = g.net.plus(d.netTotal);
      g.tax = g.tax.plus(d.taxPayable);
      g.gross = g.gross.plus(d.grossTotal);
      groups.set(k, g);
    }
    const rows = [...groups.entries()]
      .sort(([, a], [, b]) => b.gross.comparedTo(a.gross))
      .map(([cashier, g]) => ({ cashier: cashier || null, documents: g.documents, net: money(g.net), tax: money(g.tax), gross: money(g.gross) }));
    return [
      {
        columns: [
          { key: "cashier", kind: "text" },
          { key: "documents", kind: "count" },
          { key: "net", kind: "money" },
          { key: "tax", kind: "money" },
          { key: "gross", kind: "money" },
        ],
        rows,
        totals: { cashier: null, ...sumColumns(rows, ["documents"], "count"), ...sumColumns(rows, ["net", "tax", "gross"]) },
      },
    ];
  }

  /** FR and RC payments, NC refunds of the period (not annulled). */
  private paymentEntries(s: Scope) {
    const p = s.period!;
    return this.prisma.fiscalDocument.findMany({
      where: {
        businessId: s.businessId,
        ...(s.storeId ? { storeId: s.storeId } : {}),
        status: { not: "A" },
        documentType: { in: ["FR", "NC", "RC"] },
        invoiceDate: { gte: dateColumnValue(p.startDate), lte: dateColumnValue(p.endDate) },
      },
      select: { documentType: true, storeId: true, payments: true },
    });
  }

  private async salesByPayment(s: Scope): Promise<ReportTable[]> {
    const byMethod = paymentsByMethod(await this.paymentEntries(s));
    const rows = [...byMethod.entries()]
      .sort(([, a], [, b]) => b.received.comparedTo(a.received))
      .map(([method, v]) => ({ method, received: money(v.received), refunded: money(v.refunded), net: money(v.received.minus(v.refunded)) }));
    const p = s.period!;
    const onAccount = await this.prisma.fiscalDocument.aggregate({
      where: {
        businessId: s.businessId,
        ...(s.storeId ? { storeId: s.storeId } : {}),
        status: { not: "A" },
        documentType: "FT",
        invoiceDate: { gte: dateColumnValue(p.startDate), lte: dateColumnValue(p.endDate) },
      },
      _count: true,
      _sum: { grossTotal: true },
    });
    return [
      {
        columns: [
          { key: "method", kind: "method" },
          { key: "received", kind: "money" },
          { key: "refunded", kind: "money" },
          { key: "net", kind: "money" },
        ],
        rows,
        totals: { method: null, ...sumColumns(rows, ["received", "refunded", "net"]) },
      },
      {
        title: "onAccount",
        columns: [
          { key: "documents", kind: "count" },
          { key: "gross", kind: "money" },
        ],
        rows: [{ documents: onAccount._count, gross: money(onAccount._sum.grossTotal) }],
        totals: null,
      },
    ];
  }

  private async salesByDocumentType(s: Scope): Promise<ReportTable[]> {
    const p = s.period!;
    const rows = await this.prisma.$queryRaw<{ documentType: string; documents: number; annulled: number; net: Prisma.Decimal; tax: Prisma.Decimal; gross: Prisma.Decimal }[]>(Prisma.sql`
      SELECT d."documentType",
             COUNT(*) FILTER (WHERE d.status <> 'A')::int AS documents,
             COUNT(*) FILTER (WHERE d.status = 'A')::int AS annulled,
             COALESCE(SUM(d."netTotal") FILTER (WHERE d.status <> 'A'), 0) AS net,
             COALESCE(SUM(d."taxPayable") FILTER (WHERE d.status <> 'A'), 0) AS tax,
             COALESCE(SUM(d."grossTotal") FILTER (WHERE d.status <> 'A'), 0) AS gross
      FROM fiscal_documents d
      WHERE d."businessId" = ${s.businessId} ${this.storeSql(s, Prisma.sql`d."storeId"`)}
        AND d."invoiceDate" BETWEEN ${p.startDate}::date AND ${p.endDate}::date
      GROUP BY d."documentType"
      ORDER BY d."documentType"
    `);
    return [
      {
        columns: [
          { key: "documentType", kind: "docType" },
          { key: "documents", kind: "count" },
          { key: "annulled", kind: "count" },
          { key: "net", kind: "money" },
          { key: "tax", kind: "money" },
          { key: "gross", kind: "money" },
        ],
        rows: rows.map((r) => ({ documentType: r.documentType, documents: r.documents, annulled: r.annulled, net: money(r.net), tax: money(r.tax), gross: money(r.gross) })),
        // Types don't add up (a receipt settles an invoice): no totals.
        totals: null,
      },
    ];
  }

  /**
   * IVA by code, rate and exemption (credit notes subtract). Stores in the
   * Simplificado regime issue exempt documents (M00) and owe a rate on the
   * money they actually received: a second table.
   */
  private async ivaSummary(s: Scope): Promise<ReportTable[]> {
    const p = s.period!;
    const taxes = await this.prisma.$queryRaw<{ taxType: string; taxCode: string; percentage: Prisma.Decimal; exemptionCode: string | null; base: Prisma.Decimal; tax: Prisma.Decimal }[]>(Prisma.sql`
      SELECT t."taxType", t."taxCode", t.percentage, t."exemptionCode",
             SUM(CASE WHEN d."documentType" = 'NC' THEN -l."netAmount" ELSE l."netAmount" END) AS base,
             SUM(CASE WHEN d."documentType" = 'NC' THEN -t.amount ELSE t.amount END) AS tax
      FROM fiscal_documents d
      JOIN fiscal_document_lines l ON l."documentId" = d.id
      JOIN fiscal_document_line_taxes t ON t."lineId" = l.id
      WHERE d."businessId" = ${s.businessId} ${this.storeSql(s, Prisma.sql`d."storeId"`)}
        AND d.status <> 'A'
        AND d."documentType" IN (${Prisma.join(SALES_TYPES)})
        AND d."invoiceDate" BETWEEN ${p.startDate}::date AND ${p.endDate}::date
      GROUP BY t."taxType", t."taxCode", t.percentage, t."exemptionCode"
      ORDER BY t."taxType", t.percentage DESC, t."exemptionCode" NULLS FIRST
    `);
    const rows = taxes.map((t) => ({ taxType: t.taxType, taxCode: t.taxCode, rate: D(t.percentage).toNumber(), exemptionCode: t.exemptionCode, base: money(t.base), tax: money(t.tax) }));
    const tables: ReportTable[] = [
      {
        columns: [
          { key: "taxType", kind: "text" },
          { key: "taxCode", kind: "text" },
          { key: "rate", kind: "percent" },
          { key: "exemptionCode", kind: "text" },
          { key: "base", kind: "money" },
          { key: "tax", kind: "money" },
        ],
        rows,
        totals: { taxType: null, taxCode: null, rate: null, exemptionCode: null, ...sumColumns(rows, ["base", "tax"]) },
      },
    ];

    const simplified = s.stores
      .map((st) => ({ store: st, rate: countryConfig(st.country)?.ivaRegimes.find((r) => r.code === st.ivaRegime)?.turnoverRate ?? null }))
      .filter((x): x is { store: Scope["stores"][number]; rate: number } => x.rate !== null);
    if (simplified.length) {
      const entries = await this.paymentEntries(s);
      const turnoverRows = simplified.map(({ store, rate }) => {
        const received = turnoverReceived(entries.filter((e) => e.storeId === store.id));
        return { store: store.name, received: money(received), rate, due: money(received.times(rate).div(100)) };
      });
      tables.push({
        title: "simplified",
        columns: [
          { key: "store", kind: "text" },
          { key: "received", kind: "money" },
          { key: "rate", kind: "percent" },
          { key: "due", kind: "money" },
        ],
        rows: turnoverRows,
        totals: { store: null, rate: null, ...sumColumns(turnoverRows, ["received", "due"]) },
      });
    }
    return tables;
  }

  private async stockValuation(s: Scope): Promise<ReportTable[]> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { store: { businessId: s.businessId }, ...(s.storeId ? { storeId: s.storeId } : {}), product: { trackStock: true }, quantity: { not: 0 } },
      select: { quantity: true, averageCost: true, product: { select: { id: true, sku: true, name: true, costPrice: true, category: { select: { name: true } } } } },
    });
    // Across stores, a product's quantities add up and their values too.
    const byProduct = new Map<string, { code: string; product: string; category: string | null; quantity: Prisma.Decimal; value: Prisma.Decimal }>();
    for (const i of items) {
      const unit = i.averageCost.isZero() ? i.product.costPrice : i.averageCost;
      const g = byProduct.get(i.product.id) ?? { code: i.product.sku, product: i.product.name, category: i.product.category?.name ?? null, quantity: ZERO, value: ZERO };
      g.quantity = g.quantity.plus(i.quantity);
      g.value = g.value.plus(i.quantity.times(unit));
      byProduct.set(i.product.id, g);
    }
    const rows = [...byProduct.values()]
      .sort((a, b) => a.product.localeCompare(b.product))
      .map((g) => ({
        code: g.code,
        product: g.product,
        category: g.category,
        quantity: quantity(g.quantity),
        averageCost: g.quantity.isZero() ? null : money(g.value.div(g.quantity)),
        value: money(g.value),
      }));
    return [
      {
        columns: [
          { key: "code", kind: "text" },
          { key: "product", kind: "text" },
          { key: "category", kind: "text" },
          { key: "quantity", kind: "quantity" },
          { key: "averageCost", kind: "money" },
          { key: "value", kind: "money" },
        ],
        rows,
        totals: { code: null, product: null, category: null, quantity: null, averageCost: null, ...sumColumns(rows, ["value"]) },
      },
    ];
  }

  private async lowStock(s: Scope): Promise<ReportTable[]> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { store: { businessId: s.businessId }, ...(s.storeId ? { storeId: s.storeId } : {}), product: { trackStock: true, isActive: true } },
      select: { quantity: true, reorderLevel: true, store: { select: { name: true } }, product: { select: { sku: true, name: true } } },
      orderBy: { quantity: "asc" },
    });
    const rows = items
      .filter((i) => i.quantity.lte(i.reorderLevel))
      .map((i) => ({ code: i.product.sku, product: i.product.name, store: i.store.name, quantity: quantity(i.quantity), reorderLevel: quantity(i.reorderLevel) }));
    return [
      {
        columns: [
          { key: "code", kind: "text" },
          { key: "product", kind: "text" },
          { key: "store", kind: "text" },
          { key: "quantity", kind: "quantity" },
          { key: "reorderLevel", kind: "quantity" },
        ],
        rows,
        totals: null,
      },
    ];
  }

  /** What customers owe now (business-wide: an account isn't a store's). */
  private async customerBalances(s: Scope): Promise<ReportTable[]> {
    const list = await this.prisma.customer.findMany({ where: { businessId: s.businessId, isFinalConsumer: false }, select: { id: true, name: true, taxId: true, creditLimit: true } });
    const balances = await this.customers.balances(s.businessId, list.map((c) => c.id));
    const rows = list
      .filter((c) => !balances.get(c.id)!.isZero())
      .sort((a, b) => balances.get(b.id)!.comparedTo(balances.get(a.id)!))
      .map((c) => ({ customer: c.name, taxId: c.taxId, creditLimit: c.creditLimit === null ? null : money(c.creditLimit), balance: money(balances.get(c.id)) }));
    return [
      {
        columns: [
          { key: "customer", kind: "text" },
          { key: "taxId", kind: "text" },
          { key: "creditLimit", kind: "money" },
          { key: "balance", kind: "money" },
        ],
        rows,
        totals: { customer: null, taxId: null, creditLimit: null, ...sumColumns(rows, ["balance"]) },
      },
    ];
  }

  /** What is owed to suppliers now (business-wide). */
  private async supplierBalances(s: Scope): Promise<ReportTable[]> {
    const list = await this.prisma.supplier.findMany({ where: { businessId: s.businessId }, select: { id: true, name: true, taxId: true } });
    const balances = await this.suppliers.balances(s.businessId, list.map((x) => x.id));
    const rows = list
      .filter((x) => !balances.get(x.id)!.isZero())
      .sort((a, b) => balances.get(b.id)!.comparedTo(balances.get(a.id)!))
      .map((x) => ({ supplier: x.name, taxId: x.taxId, balance: money(balances.get(x.id)) }));
    return [
      {
        columns: [
          { key: "supplier", kind: "text" },
          { key: "taxId", kind: "text" },
          { key: "balance", kind: "money" },
        ],
        rows,
        totals: { supplier: null, taxId: null, ...sumColumns(rows, ["balance"]) },
      },
    ];
  }

  /** The period's purchases (not cancelled) by supplier, by the store's date. */
  private async purchases(s: Scope): Promise<ReportTable[]> {
    const p = s.period!;
    const list = await this.prisma.purchase.findMany({
      where: { store: { businessId: s.businessId }, ...(s.storeId ? { storeId: s.storeId } : {}), status: { not: PurchaseStatus.CANCELLED }, createdAt: { gte: p.from, lt: p.until } },
      select: { supplierId: true, subtotal: true, taxTotal: true, total: true, withholdingAmount: true, paidAmount: true, supplier: { select: { name: true, taxId: true } } },
    });
    const groups = new Map<string, { supplier: string; taxId: string | null; purchases: number; net: Prisma.Decimal; tax: Prisma.Decimal; total: Prisma.Decimal; withholding: Prisma.Decimal; paid: Prisma.Decimal; open: Prisma.Decimal }>();
    for (const x of list) {
      const g = groups.get(x.supplierId) ?? { supplier: x.supplier.name, taxId: x.supplier.taxId, purchases: 0, net: ZERO, tax: ZERO, total: ZERO, withholding: ZERO, paid: ZERO, open: ZERO };
      g.purchases += 1;
      g.net = g.net.plus(x.subtotal);
      g.tax = g.tax.plus(x.taxTotal);
      g.total = g.total.plus(x.total);
      g.withholding = g.withholding.plus(x.withholdingAmount);
      g.paid = g.paid.plus(x.paidAmount);
      g.open = g.open.plus(Prisma.Decimal.max(payableOf(x).minus(x.paidAmount), 0));
      groups.set(x.supplierId, g);
    }
    const rows = [...groups.values()]
      .sort((a, b) => b.total.comparedTo(a.total))
      .map((g) => ({
        supplier: g.supplier,
        taxId: g.taxId,
        purchases: g.purchases,
        net: money(g.net),
        tax: money(g.tax),
        total: money(g.total),
        withholding: money(g.withholding),
        paid: money(g.paid),
        open: money(g.open),
      }));
    return [
      {
        columns: [
          { key: "supplier", kind: "text" },
          { key: "taxId", kind: "text" },
          { key: "purchases", kind: "count" },
          { key: "net", kind: "money" },
          { key: "tax", kind: "money" },
          { key: "total", kind: "money" },
          { key: "withholding", kind: "money" },
          { key: "paid", kind: "money" },
          { key: "open", kind: "money" },
        ],
        rows,
        totals: { supplier: null, taxId: null, ...sumColumns(rows, ["purchases"], "count"), ...sumColumns(rows, ["net", "tax", "total", "withholding", "paid", "open"]) },
      },
    ];
  }

  /** The period's documents sent to AGT, by state, and the rejected ones with AGT's errors. */
  private async agtStatus(s: Scope): Promise<ReportTable[]> {
    const p = s.period!;
    const where = {
      businessId: s.businessId,
      document: { ...(s.storeId ? { storeId: s.storeId } : {}), invoiceDate: { gte: dateColumnValue(p.startDate), lte: dateColumnValue(p.endDate) } },
    };
    const counts = await this.prisma.agtSubmission.groupBy({ by: ["status"], where, _count: true });
    const rejected = await this.prisma.agtSubmission.findMany({
      where: { ...where, status: AgtStatus.REJECTED },
      select: { errors: true, correctedByDocumentId: true, document: { select: { documentNo: true, invoiceDate: true } } },
      orderBy: { createdAt: "asc" },
    });
    const statusRows = Object.values(AgtStatus).map((status) => ({ status, documents: counts.find((c) => c.status === status)?._count ?? 0 }));
    return [
      {
        columns: [
          { key: "status", kind: "agtStatus" },
          { key: "documents", kind: "count" },
        ],
        rows: statusRows,
        totals: sumColumns(statusRows, ["documents"], "count"),
      },
      {
        title: "rejected",
        columns: [
          { key: "date", kind: "date" },
          { key: "documentNo", kind: "text" },
          { key: "errors", kind: "text" },
          { key: "corrected", kind: "text" },
        ],
        rows: rejected.map((r) => ({
          date: r.document.invoiceDate.toISOString().slice(0, 10),
          documentNo: r.document.documentNo,
          errors: (Array.isArray(r.errors) ? (r.errors as { code: string; description: string }[]) : []).map((e) => `${e.code} ${e.description}`).join("; "),
          corrected: r.correctedByDocumentId ? "✓" : null,
        })),
        totals: null,
      },
    ];
  }
}
