import { Prisma } from "@prisma/client";

/**
 * A stored fiscal document as AGT's registarFactura wants it
 * (quiosqueagt.minfin.gov.ao/doc-agt/faturacao-electronica, schema 2.0).
 * Pure: the queue loads the data and signs. Amounts are sent as numbers.
 */

type Money = Prisma.Decimal;

/**
 * Line operationType. AGT lists SE, SS, STP, SR, SIF, SHS, ST, SG, TB, AS,
 * QT, RD without saying what each is; TB (goods) and SE (services) are our
 * reading, to confirm in homologation (docs/DECISIONS.md, phase 9).
 */
export const OPERATION_TYPES: Record<string, string> = { P: "TB", S: "SE", O: "TB", E: "TB", I: "TB" };

export interface AgtLineInput {
  lineNumber: number;
  productCode: string;
  productDescription: string;
  /** SAF-T ProductType (P, S...). */
  productType: string;
  quantity: Money;
  unit: string;
  /** Per unit, without tax, after discounts. */
  unitPrice: Money;
  netAmount: Money;
  discountAmount: Money;
  referenceDocumentNo: string | null;
  taxes: { taxType: string; taxCountryRegion: string; taxCode: string; percentage: Money; amount: Money; exemptionCode: string | null }[];
}

export interface AgtDocumentInput {
  documentNo: string;
  documentType: string;
  /** YYYY-MM-DD, the shop's day. */
  documentDate: string;
  systemEntryDate: Date;
  issuerTaxId: string;
  eacCode: string | null;
  buyerName: string;
  buyerTaxId: string;
  buyerCountry: string;
  reason: string | null;
  netTotal: Money;
  taxPayable: Money;
  grossTotal: Money;
  lines: AgtLineInput[];
  /** A receipt (RC): the invoices it settled. */
  settled?: { documentNo: string; documentDate: string; amount: Money; netTotal: Money; grossTotal: Money }[];
  /** Resending a rejected document under a new number. */
  correctionOf?: string | null;
}

const num = (v: Money) => v.toNumber();
const money = (v: Money) => v.toDecimalPlaces(2).toNumber();
/** Without a timezone's milliseconds: 2026-10-16T09:30:00Z. */
export const isoSeconds = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;

/** What jwsDocumentSignature signs: this object, whole. */
export function documentSignaturePayload(doc: AgtDocumentInput) {
  return {
    documentNo: doc.documentNo,
    taxRegistrationNumber: doc.issuerTaxId,
    documentType: doc.documentType,
    documentDate: doc.documentDate,
    customerTaxID: doc.buyerTaxId,
    customerCountry: doc.buyerCountry,
    companyName: doc.buyerName,
    documentTotals: { taxPayable: money(doc.taxPayable), netTotal: money(doc.netTotal), grossTotal: money(doc.grossTotal) },
  };
}

export function buildAgtDocument(doc: AgtDocumentInput, signDocument: (payload: object) => string) {
  const isReceipt = ["AR", "RC", "RG"].includes(doc.documentType);
  const debit = doc.documentType === "NC";
  const signed = documentSignaturePayload(doc);
  let totals = signed.documentTotals;
  let paymentReceipt: object | undefined;
  if (isReceipt) {
    // Without tax, in the proportion of each invoice settled (as in SAF-T Payments).
    const lines = (doc.settled ?? []).map((s, i) => {
      const net = s.grossTotal.isZero() ? s.amount : s.amount.times(s.netTotal).div(s.grossTotal).toDecimalPlaces(2);
      return { lineNo: i + 1, sourceDocumentID: { OriginatingON: s.documentNo, documentDate: s.documentDate }, creditAmount: money(net), net };
    });
    const net = lines.reduce((a, l) => a.add(l.net), new Prisma.Decimal(0));
    totals = { taxPayable: money(doc.grossTotal.sub(net)), netTotal: money(net), grossTotal: money(doc.grossTotal) };
    paymentReceipt = { sourceDocuments: lines.map(({ net: _net, ...l }) => l) };
  }
  return {
    documentNo: doc.documentNo,
    documentStatus: doc.correctionOf ? "C" : "N",
    ...(doc.correctionOf ? { rejectedDocumentNo: doc.correctionOf } : {}),
    jwsDocumentSignature: signDocument({ ...signed, documentTotals: totals }),
    documentDate: doc.documentDate,
    documentType: doc.documentType,
    ...(doc.eacCode && /^\d{5}$/.test(doc.eacCode) ? { eacCode: doc.eacCode } : {}),
    systemEntryDate: isoSeconds(doc.systemEntryDate),
    customerCountry: doc.buyerCountry,
    customerTaxID: doc.buyerTaxId,
    companyName: doc.buyerName,
    ...(isReceipt
      ? { paymentReceipt }
      : {
          lines: doc.lines.map((l) => {
            const quantity = num(l.quantity);
            const base = quantity > 0 ? l.netAmount.add(l.discountAmount).div(l.quantity).toDecimalPlaces(6) : l.unitPrice;
            return {
              lineNumber: l.lineNumber,
              operationType: OPERATION_TYPES[l.productType] ?? "TB",
              productCode: l.productCode,
              productDescription: l.productDescription.slice(0, 200),
              quantity,
              unitOfMeasure: l.unit,
              unitPriceBase: num(base),
              unitPrice: num(l.unitPrice),
              ...(debit && l.referenceDocumentNo ? { referenceInfo: { reference: l.referenceDocumentNo, ...(doc.reason ? { reason: doc.reason.slice(0, 60) } : {}) } } : {}),
              [debit ? "debitAmount" : "creditAmount"]: money(l.netAmount),
              taxes: l.taxes.map((t) => ({
                taxType: t.taxType,
                taxCountryRegion: t.taxCountryRegion,
                taxCode: t.taxCode,
                taxPercentage: num(t.percentage),
                taxContribution: money(t.amount),
                ...(t.exemptionCode ? { taxExemptionCode: t.exemptionCode } : {}),
              })),
              settlementAmount: money(l.discountAmount),
            };
          }),
        }),
    documentTotals: totals,
  };
}
