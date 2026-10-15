import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { countryConfig, lineTax, type CountryConfig, type IvaRegime } from "../countries";
import { priceSaleCents, unitDecimals } from "../sales/pricing";
import type { CreateProformaDto } from "./dto/create-proforma.dto";
import { documentLine, documentTotals, partOfLine, type DocumentLineData, type SourceLine } from "./document-lines";
import {
  ANNULMENT_REASONS,
  documentNumber,
  fiscalTimeZone,
  fixed2,
  localDateTime,
  storeSeriesCode,
  terminalSeriesCode,
} from "./fiscal-format";
import { hashExcerpt, hashMessage, SIGNATURE_PROVIDER, type SignatureProvider } from "./signature";

type Tx = Prisma.TransactionClient;

/** What every document needs to know about who issues it, loaded before the transaction. */
export interface IssuerContext {
  businessId: string;
  storeId: string;
  config: CountryConfig | null;
  timeZone: string;
  currency: string;
  /** Frozen on the document. */
  seller: Prisma.InputJsonObject;
  finalConsumerTaxId: string;
}

export interface Buyer {
  id: string;
  name: string;
  taxId: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  province: string | null;
  country: string;
}

/** The number a till gave a document, in its own series. */
export interface RequestedNumber {
  series: string;
  number: number;
}

const SALE_FOR_DOCUMENT = {
  lineItems: { include: { product: { select: { taxRateRef: { select: { region: true } } } } } },
  payments: true,
} satisfies Prisma.SaleInclude;
type SaleForDocument = Prisma.SaleGetPayload<{ include: typeof SALE_FOR_DOCUMENT }>;

export const DOCUMENT_INCLUDE = {
  lines: { include: { taxes: true }, orderBy: { lineNumber: "asc" } },
  referencedDocument: { select: { id: true, documentNo: true, documentType: true, invoiceDate: true } },
} satisfies Prisma.FiscalDocumentInclude;

/** On a sale: enough to print the number and know its state. */
export const DOCUMENT_SUMMARY = {
  select: { id: true, documentType: true, documentNo: true, status: true, hashExcerpt: true, hashControl: true, seller: true },
} as const;

/**
 * Fiscal documents (docs/plans/ANGOLA.md, phase 8): every completed sale is
 * a Factura-Recibo (FR), a return is a Nota de Crédito (NC) pointing at it,
 * cancelling a sale annuls its FR. Numbers are gap-free per series and each
 * document signs over the previous one's hash (SignatureProvider).
 */
@Injectable()
export class FiscalService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SIGNATURE_PROVIDER) private readonly signer: SignatureProvider,
  ) {}

  /** The AGT certificate of this software, once it has one (until then: watermark, HashControl "0"). */
  certificate(): string | null {
    return process.env.AGT_SOFTWARE_CERTIFICATE || null;
  }

  async issuer(businessId: string, storeId: string): Promise<IssuerContext> {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, businessId }, include: { business: true } });
    if (!store) throw new NotFoundException("Store not found");
    const b = store.business;
    const config = countryConfig(store.country);
    return {
      businessId,
      storeId,
      config,
      timeZone: fiscalTimeZone(store.timezone, config?.timeZone),
      currency: b.currency,
      finalConsumerTaxId: config?.finalConsumerTaxId ?? "999999999",
      seller: {
        name: b.name,
        legalName: b.legalName,
        taxId: b.taxId,
        registrationNumber: b.registrationNumber,
        legalForm: b.legalForm,
        address: b.address,
        city: b.city,
        postalCode: b.postalCode,
        province: b.province,
        country: b.country,
        phone: b.phone,
        email: b.email,
        website: b.website,
        logoUrl: b.logoUpdatedAt ? `/businesses/${b.id}/logo?v=${b.logoUpdatedAt.getTime()}` : null,
        eacCode: b.eacCode,
        invoiceFooter: b.invoiceFooter,
        currency: b.currency,
        store: { id: store.id, name: store.name, address: store.address, city: store.city, province: store.province, phone: store.phone },
        ivaRegime: store.ivaRegime,
        certificate: this.certificate(),
      },
    };
  }

  /** The Factura-Recibo for a completed sale, inside the sale's transaction. */
  async issueForSale(
    tx: Tx,
    input: {
      issuer: IssuerContext;
      saleId: string;
      terminal: { id: string; code: string } | null;
      userId: string;
      buyer: Buyer | null;
      requested?: RequestedNumber;
      proformaId?: string | null;
    },
  ) {
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: input.saleId }, include: SALE_FOR_DOCUMENT });
    const lines = sale.lineItems.map((li, i) => documentLine(sourceLine(li, input.issuer), i + 1, input.issuer.config, sale.pricesIncludeTax));
    let referenced: { id: string } | null = null;
    if (input.proformaId) {
      referenced = await tx.fiscalDocument.findFirst({
        where: { id: input.proformaId, businessId: input.issuer.businessId, documentType: "PF", status: "N" },
        select: { id: true },
      });
      if (!referenced) throw new BadRequestException("That proforma isn't open any more");
    }
    const document = await this.write(tx, {
      issuer: input.issuer,
      documentType: "FR",
      terminal: input.terminal,
      requested: input.requested,
      at: sale.createdAt,
      userId: input.userId,
      buyer: input.buyer,
      pricesIncludeTax: sale.pricesIncludeTax,
      lines,
      payments: payments(sale, input.issuer.config),
      saleId: sale.id,
      referencedDocumentId: referenced?.id ?? null,
    });
    if (referenced) {
      await tx.fiscalDocument.update({ where: { id: referenced.id }, data: { status: "F", statusDate: new Date(), statusById: input.userId } });
    }
    return document;
  }

  /**
   * The Nota de Crédito for a return: the returned part of each line, each
   * pointing at the FR line it corrects. Sales from before fiscal documents
   * point at their receipt number.
   */
  async issueCreditNote(
    tx: Tx,
    input: {
      issuer: IssuerContext;
      returnId: string;
      terminal: { id: string; code: string } | null;
      userId: string;
      reason: string | null;
    },
  ) {
    const ret = await tx.return.findUniqueOrThrow({
      where: { id: input.returnId },
      include: { lineItems: true, sale: { include: { ...SALE_FOR_DOCUMENT, customer: true } } },
    });
    const sale = ret.sale;
    const original = await tx.fiscalDocument.findFirst({
      where: { saleId: sale.id, documentType: { in: ["FR", "FT"] } },
      select: { id: true, documentNo: true, buyerName: true, buyerTaxId: true, customerId: true },
    });
    const lines: DocumentLineData[] = ret.lineItems.map((rl, i) => {
      const index = sale.lineItems.findIndex((sl) => sl.productId === rl.productId);
      if (index < 0) throw new BadRequestException("A returned product wasn't on the sale");
      const part = partOfLine(sourceLine(sale.lineItems[index], input.issuer), rl.quantity);
      return documentLine(part, i + 1, input.issuer.config, sale.pricesIncludeTax, {
        documentNo: original?.documentNo ?? sale.receiptNumber,
        lineNumber: original ? index + 1 : null,
      });
    });
    return this.write(tx, {
      issuer: input.issuer,
      documentType: "NC",
      terminal: input.terminal,
      at: ret.createdAt,
      userId: input.userId,
      buyer: sale.customer ? buyerOf(sale.customer) : null,
      pricesIncludeTax: sale.pricesIncludeTax,
      lines,
      payments: [{ method: ret.refundMethod, mechanism: input.issuer.config?.paymentMechanisms[ret.refundMethod] ?? "OU", amount: fixed2(ret.totalRefund) }],
      returnId: ret.id,
      saleId: sale.id,
      referencedDocumentId: original?.id ?? null,
      reason: input.reason?.trim().slice(0, 50) || "Devolução de mercadoria",
    });
  }

  /** Cancelling a sale annuls its Factura-Recibo (status A), with why and who. */
  async annulForSale(tx: Tx, saleId: string, reasonCode: string, userId: string, at: Date, note?: string | null) {
    const documents = await tx.fiscalDocument.findMany({ where: { saleId, documentType: { in: ["FR", "FT"] }, status: "N" }, select: { id: true } });
    for (const d of documents) {
      const reason = note?.trim() ? `${ANNULMENT_REASONS[reasonCode] ?? ANNULMENT_REASONS.OTHER}: ${note.trim()}` : ANNULMENT_REASONS[reasonCode] ?? ANNULMENT_REASONS.OTHER;
      await tx.fiscalDocument.update({
        where: { id: d.id },
        data: { status: "A", statusDate: at, statusReason: reason.slice(0, 50), statusReasonCode: reasonCode, statusById: userId },
      });
    }
  }

  /** A proforma (Factura Pró-forma): not a fiscal sale, but numbered, signed and exported as a working document. */
  async issueProforma(
    tx: Tx,
    input: { issuer: IssuerContext; userId: string; buyer: Buyer | null; pricesIncludeTax: boolean; lines: SourceLine[]; at?: Date },
  ) {
    const lines = input.lines.map((l, i) => documentLine(l, i + 1, input.issuer.config, input.pricesIncludeTax));
    return this.write(tx, {
      issuer: input.issuer,
      documentType: "PF",
      terminal: null,
      at: input.at ?? new Date(),
      userId: input.userId,
      buyer: input.buyer,
      pricesIncludeTax: input.pricesIncludeTax,
      lines,
      payments: null,
    });
  }

  /**
   * Numbers, signs and stores a document. The series row is locked for the
   * rest of the transaction, so documents in a series are written one at a
   * time and each signs over the one before.
   */
  private async write(
    tx: Tx,
    input: {
      issuer: IssuerContext;
      documentType: string;
      terminal: { id: string; code: string } | null;
      requested?: RequestedNumber;
      at: Date;
      userId: string;
      buyer: Buyer | null;
      pricesIncludeTax: boolean;
      lines: DocumentLineData[];
      payments: Prisma.InputJsonValue | null;
      saleId?: string;
      returnId?: string;
      referencedDocumentId?: string | null;
      reason?: string;
    },
  ) {
    const { issuer } = input;
    const local = localDateTime(input.at, issuer.timeZone);
    const series = await this.lockSeries(tx, issuer, input.documentType, input.terminal, local.year, input.requested);
    const number = input.requested?.number ?? series.nextNumber;
    if (number !== series.nextNumber) {
      if (number > series.nextNumber) {
        throw new ConflictException({
          message: `Document ${number} of ${series.code} came before ${series.nextNumber}; the till will send them in order`,
          code: "FISCAL_NUMBER_AHEAD",
        });
      }
      throw new UnprocessableEntityException({ message: `Document number ${number} of ${series.code} was already used`, code: "FISCAL_NUMBER_USED", nextNumber: series.nextNumber });
    }
    const documentNo = documentNumber(input.documentType, series.code, number);
    const totals = documentTotals(input.lines);
    const hash = this.signer.sign(
      hashMessage({ invoiceDate: local.date, systemEntryDate: local.dateTime, documentNo, grossTotal: fixed2(totals.grossTotal), previousHash: series.lastHash }),
    );
    const buyer = input.buyer;
    const document = await tx.fiscalDocument.create({
      data: {
        businessId: issuer.businessId,
        storeId: issuer.storeId,
        terminalId: input.terminal?.id ?? null,
        seriesId: series.id,
        documentType: input.documentType,
        number,
        documentNo,
        status: "N",
        statusDate: input.at,
        invoiceDate: new Date(`${local.date}T00:00:00Z`),
        systemEntryDate: input.at,
        period: local.month,
        sourceId: input.userId,
        hash,
        hashControl: this.certificate() ? this.signer.keyVersion : "0",
        hashExcerpt: hashExcerpt(hash),
        seller: issuer.seller,
        customerId: buyer?.id ?? null,
        buyerName: buyer?.name ?? "Consumidor Final",
        buyerTaxId: buyer?.taxId?.trim() || issuer.finalConsumerTaxId,
        buyerAddress: buyer
          ? { address: buyer.address, city: buyer.city, postalCode: buyer.postalCode, province: buyer.province, country: buyer.country }
          : Prisma.DbNull,
        currency: issuer.currency,
        pricesIncludeTax: input.pricesIncludeTax,
        ...totals,
        payments: input.payments ?? Prisma.DbNull,
        reason: input.reason ?? null,
        saleId: input.saleId ?? null,
        returnId: input.returnId ?? null,
        referencedDocumentId: input.referencedDocumentId ?? null,
        lines: {
          create: input.lines.map(({ taxes, ...line }) => ({ ...line, taxes: { create: taxes } })),
        },
      },
      include: DOCUMENT_INCLUDE,
    });
    await tx.documentSeries.update({ where: { id: series.id }, data: { nextNumber: number + 1, lastHash: hash } });
    return document;
  }

  /** The series a document goes in, created on first use and locked. */
  private async lockSeries(tx: Tx, issuer: IssuerContext, documentType: string, terminal: { id: string; code: string } | null, year: number, requested?: RequestedNumber) {
    let code: string;
    if (terminal) {
      const prefix = terminalSeriesCode(terminal.code, year).split("-")[0];
      if (requested) {
        // The till names its series: its own prefix and a year.
        const m = /^([A-Z0-9]+)-(\d{4})$/.exec(requested.series);
        if (!m || m[1] !== prefix) throw new BadRequestException(`Series ${requested.series} isn't this till's`);
        code = requested.series;
        year = Number(m[2]);
      } else {
        code = terminalSeriesCode(terminal.code, year);
      }
    } else {
      if (requested) throw new BadRequestException("Only a till numbers its own documents");
      const stores = await tx.store.findMany({ where: { businessId: issuer.businessId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
      code = storeSeriesCode(stores.findIndex((s) => s.id === issuer.storeId) + 1, year);
    }
    const series = await tx.documentSeries.upsert({
      where: { businessId_documentType_code: { businessId: issuer.businessId, documentType, code } },
      create: { businessId: issuer.businessId, storeId: issuer.storeId, terminalId: terminal?.id ?? null, documentType, code, year },
      update: {},
    });
    if ((series.terminalId ?? null) !== (terminal?.id ?? null)) throw new BadRequestException(`Series ${code} belongs to another till`);
    await tx.$queryRaw`SELECT id FROM document_series WHERE id = ${series.id} FOR UPDATE`;
    return tx.documentSeries.findUniqueOrThrow({ where: { id: series.id } });
  }

  /** Prices a proforma exactly as the till would the sale, and issues it. */
  async createProforma(businessId: string, userId: string, dto: CreateProformaDto) {
    const issuer = await this.issuer(businessId, dto.storeId);
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: dto.storeId }, select: { ivaRegime: true, pricesIncludeTax: true } });
    const ids = [...new Set(dto.lineItems.map((l) => l.productId))];
    const products = await this.prisma.product.findMany({ where: { id: { in: ids }, businessId }, include: { taxRateRef: { select: { region: true } } } });
    if (products.length !== ids.length) throw new NotFoundException("One or more products were not found");
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const l of dto.lineItems) {
      const p = byId.get(l.productId)!;
      if (unitDecimals(p.unit) === 0 && !Number.isInteger(l.quantity)) throw new BadRequestException(`"${p.name}" is sold in whole units`);
    }
    const taxes = dto.lineItems.map((l) => lineTax(issuer.config, store.ivaRegime as IvaRegime, byId.get(l.productId)!));
    const prices = dto.lineItems.map((l) => l.unitPrice ?? Number(byId.get(l.productId)!.sellPrice));
    const priced = priceSaleCents(
      dto.lineItems.map((l, i) => ({ unitPrice: prices[i], quantity: l.quantity, taxRate: taxes[i].rate, discount: l.discount?.value ? l.discount : null })),
      dto.discount?.value ? dto.discount : null,
      { taxIncluded: store.pricesIncludeTax },
    );
    const cents = (n: number) => new Prisma.Decimal(n).div(100);
    const lines: SourceLine[] = dto.lineItems.map((l, i) => {
      const p = byId.get(l.productId)!;
      return {
        productId: p.id,
        productCode: p.sku,
        productDescription: p.name,
        quantity: new Prisma.Decimal(l.quantity),
        unit: p.unit,
        lineTotal: cents(priced.lines[i].total),
        taxAmount: cents(priced.lines[i].tax),
        discountAmount: cents(priced.lines[i].discount),
        taxRate: new Prisma.Decimal(taxes[i].rate),
        taxCode: taxes[i].taxCode,
        exemptionCode: taxes[i].exemptionCode,
        region: p.taxRateRef?.region ?? issuer.config?.code ?? "AO",
      };
    });
    const customer = dto.customerId ? await this.prisma.customer.findFirst({ where: { id: dto.customerId, businessId } }) : null;
    if (dto.customerId && !customer) throw new NotFoundException("Customer not found");
    return this.prisma.$transaction((tx) =>
      this.issueProforma(tx, { issuer, userId, buyer: customer && !customer.isFinalConsumer ? buyerOf(customer) : null, pricesIncludeTax: store.pricesIncludeTax, lines }),
    );
  }

  // ---- Reading ----

  list(businessId: string, filter: { storeId?: string; type?: string; from?: string; to?: string; search?: string; take?: number; skip?: number }) {
    const where: Prisma.FiscalDocumentWhereInput = {
      businessId,
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.type ? { documentType: filter.type } : {}),
      ...(filter.from || filter.to
        ? { invoiceDate: { ...(filter.from ? { gte: new Date(`${filter.from}T00:00:00Z`) } : {}), ...(filter.to ? { lte: new Date(`${filter.to}T00:00:00Z`) } : {}) } }
        : {}),
      ...(filter.search
        ? { OR: [{ documentNo: { contains: filter.search, mode: "insensitive" } }, { buyerName: { contains: filter.search, mode: "insensitive" } }, { buyerTaxId: { contains: filter.search } }] }
        : {}),
    };
    return this.prisma.$transaction([
      this.prisma.fiscalDocument.findMany({
        where,
        orderBy: [{ systemEntryDate: "desc" }, { number: "desc" }],
        take: Math.min(filter.take ?? 50, 200),
        skip: filter.skip ?? 0,
        select: {
          id: true,
          documentType: true,
          documentNo: true,
          status: true,
          invoiceDate: true,
          systemEntryDate: true,
          buyerName: true,
          buyerTaxId: true,
          grossTotal: true,
          taxPayable: true,
          storeId: true,
          saleId: true,
        },
      }),
      this.prisma.fiscalDocument.count({ where }),
    ]);
  }

  async get(businessId: string, id: string) {
    const document = await this.prisma.fiscalDocument.findFirst({ where: { id, businessId }, include: DOCUMENT_INCLUDE });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }

  /** A till's series and their next numbers, so it can carry on numbering (offline too). */
  async tillSeries(businessId: string, terminalId: string) {
    const terminal = await this.prisma.terminal.findFirst({ where: { id: terminalId, businessId }, select: { id: true, code: true } });
    if (!terminal) throw new NotFoundException("Till not found");
    const series = await this.prisma.documentSeries.findMany({
      where: { terminalId },
      select: { documentType: true, code: true, year: true, nextNumber: true },
      orderBy: [{ year: "desc" }],
    });
    return { terminalCode: terminal.code, prefix: terminalSeriesCode(terminal.code, 2000).split("-")[0], series };
  }

  /** Re-checks a series' hash chain from the first document (for audits and tests). */
  async verifyChain(seriesId: string): Promise<{ valid: boolean; checked: number; brokenAt?: string }> {
    const series = await this.prisma.documentSeries.findUniqueOrThrow({ where: { id: seriesId }, include: { store: true } });
    const config = countryConfig(series.store.country);
    const timeZone = fiscalTimeZone(series.store.timezone, config?.timeZone);
    const documents = await this.prisma.fiscalDocument.findMany({ where: { seriesId }, orderBy: { number: "asc" } });
    let previous = "";
    for (const d of documents) {
      const local = localDateTime(d.systemEntryDate, timeZone);
      const message = hashMessage({ invoiceDate: local.date, systemEntryDate: local.dateTime, documentNo: d.documentNo, grossTotal: fixed2(d.grossTotal), previousHash: previous });
      if (!this.signer.verify(message, d.hash)) return { valid: false, checked: documents.length, brokenAt: d.documentNo };
      previous = d.hash;
    }
    return { valid: previous === series.lastHash, checked: documents.length };
  }
}

function sourceLine(li: SaleForDocument["lineItems"][number], issuer: IssuerContext): SourceLine {
  return {
    productId: li.productId,
    productCode: li.productSku,
    productDescription: li.productName,
    quantity: li.quantity,
    unit: li.unit,
    lineTotal: li.lineTotal,
    taxAmount: li.taxAmount,
    discountAmount: li.discountAmount,
    taxRate: li.taxRate,
    taxCode: li.taxCode,
    exemptionCode: li.exemptionCode,
    region: li.product.taxRateRef?.region ?? issuer.config?.code ?? "AO",
  };
}

function payments(sale: SaleForDocument, config: CountryConfig | null): Prisma.InputJsonValue {
  return sale.payments.map((p) => ({ method: p.method, mechanism: config?.paymentMechanisms[p.method] ?? "OU", amount: fixed2(p.amount) }));
}

export function buyerOf(c: { id: string; name: string; taxId: string | null; address: string | null; city: string | null; postalCode: string | null; province: string | null; country: string }): Buyer {
  return { id: c.id, name: c.name, taxId: c.taxId, address: c.address, city: c.city, postalCode: c.postalCode, province: c.province, country: c.country };
}
