import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { buildXlsx } from "../common/xlsx";
import { countryConfig } from "../countries";
import { PrismaService } from "../prisma/prisma.service";
import { fiscalTimeZone, localDateTime } from "./fiscal-format";
import { FiscalService } from "./fiscal.service";
import { AccountantMoneyMovement, AccountantPurchase, AccountantSale, AccountantTax, accountantSheets } from "./saft/accountant";
import { buildFacturacaoXml, SaftCustomer, SaftDocument, SaftLine, SaftProduct, SaftTax, SaftTaxTableEntry } from "./saft/facturacao";
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
  ) {}

  /** SAF-T (AO) Facturação: the period's sales documents, working documents and receipts. */
  async facturacao(businessId: string, userId: string, query: ExportQuery, now = new Date()): Promise<ExportFile> {
    const ctx = await this.context(businessId, query.storeId);
    const nif = this.requireNif(ctx.business.taxId);
    if (ctx.business.currency !== "AOA") {
      throw new BadRequestException("SAF-T (AO) files are in kwanzas: set the business currency to AOA first");
    }
    const period = this.period(query, ctx.timeZone, now, true);
    const documents = await this.prisma.fiscalDocument.findMany({
      where: {
        businessId,
        ...(ctx.store ? { storeId: ctx.store.id } : {}),
        invoiceDate: { gte: dateColumnValue(period.startDate), lte: dateColumnValue(period.endDate) },
      },
      include: { lines: { include: { taxes: true }, orderBy: { lineNumber: "asc" } }, series: { select: { code: true } } },
    });
    documents.sort(
      (a, b) => a.documentType.localeCompare(b.documentType) || a.series.code.localeCompare(b.series.code) || a.number - b.number,
    );

    const zoneOf = (storeId: string) => ctx.storeZones.get(storeId) ?? ctx.timeZone;
    const customers = await this.customersFor(businessId, documents);
    const toDoc = (d: DocumentWithLines): SaftDocument => {
      const tz = zoneOf(d.storeId);
      const date = dateOf(d.invoiceDate);
      return {
        documentNo: d.documentNo,
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
    const xml = buildFacturacaoXml({
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
      taxEntity: ctx.store ? ctx.store.name : "Global",
      customers: customers.list,
      products: await this.productsFor(businessId, documents),
      taxTable: await this.taxTableFor(businessId, documents),
      salesInvoices: sales.map(toDoc),
      workingDocuments: working.map(toDoc),
      payments: [],
    });

    await this.logExport(businessId, userId, "SAFT_FACTURACAO", { startDate: period.startDate, endDate: period.endDate, storeId: ctx.store?.id ?? null, documents: documents.length });
    return {
      fileName: `SAFT-AO_${nif}_${period.startDate}_${period.endDate}${ctx.store ? `_${this.fileSafe(ctx.store.name)}` : ""}.xml`,
      mimeType: "application/xml; charset=utf-8",
      body: xml,
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
        paymentStatus: d.documentType === "FR" ? "Pago" : d.documentType === "FT" ? "Por pagar" : "",
      };
    });

    const purchaseRows = await this.prisma.purchase.findMany({
      where: { store: { businessId }, ...storeFilter, createdAt: { gte: period.from, lt: period.until } },
      include: { supplier: true },
      orderBy: { createdAt: "asc" },
    });
    const purchases: AccountantPurchase[] = purchaseRows.map((p) => {
      // A cancelled purchase is listed but adds nothing.
      const k = p.status === "CANCELLED" ? 0 : 1;
      return {
        date: localDate(p.createdAt, ctx.storeZones.get(p.storeId) ?? ctx.timeZone),
        number: p.purchaseNumber,
        supplierTaxId: p.supplier.taxId ?? "",
        supplierName: p.supplier.name,
        store: storeName.get(p.storeId) ?? "",
        netTotal: p.subtotal.times(k),
        taxTotal: p.taxTotal.times(k),
        total: p.total.times(k),
        status: PURCHASE_STATUS_NAMES[p.status] ?? p.status,
        paymentStatus: "",
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

  /** The customers the documents name; a document without one is Consumidor Final's. */
  private async customersFor(businessId: string, documents: { customerId: string | null; buyerName: string; buyerTaxId: string }[]) {
    const ids = [...new Set(documents.map((d) => d.customerId).filter((id): id is string => !!id))];
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
    const list: SaftCustomer[] = rows.map((c) => ({
      id: exportId(c),
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
