import { Prisma } from "@prisma/client";
import { optionalText, text, UNKNOWN, XmlWriter } from "./xml";

/**
 * SAF-T (AO) Facturação file (TaxAccountingBasis "F"), and the integrated
 * accounting file ("I": the general ledger as well, see GeneralLedgerInput), as
 * docs/saft-ao/xsd/SAFTAO1.01_01.xsd lays it out, with the field rules of
 * Decreto Executivo 317/20. Pure: SaftExportService loads the data; the
 * tests validate what this writes against the XSD.
 */

export const SAFT_NAMESPACE = "urn:OECD:StandardAuditFile-Tax:AO_1.01_01";

type Money = Prisma.Decimal;

export interface SaftAddress {
  detail?: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
  /** ISO 3166-1 alpha-2, or "Desconhecido" (consumidor final). */
  country?: string | null;
}

export interface SaftCompany {
  /** NIF, 10-15 characters. */
  taxId: string;
  /** Registo comercial, or the NIF when there's none. */
  companyId: string;
  legalName: string;
  /** Trading name, when different from the legal name. */
  businessName?: string | null;
  address: SaftAddress;
  eacCode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

export interface SaftSoftware {
  /** NIF of the company that makes the software. */
  producerTaxId: string;
  /** "Application name/Producer name". */
  productId: string;
  version: string;
  /** "NNN/AGT/AAAA" once certified, "0" until then. */
  validationNumber: string;
}

export interface SaftCustomer {
  id: string;
  /** The customer's account in the chart (AccountID); "Desconhecido" without one. */
  accountId?: string | null;
  taxId: string;
  name: string;
  finalConsumer: boolean;
  address: SaftAddress;
  phone?: string | null;
  email?: string | null;
}

export interface SaftProduct {
  /** As on the document lines (the SKU when sold). */
  code: string;
  /** P, S, O, E, I */
  type: string;
  group?: string | null;
  description: string;
  /** Barcode, or the code. */
  numberCode: string;
}

export interface SaftTax {
  /** IVA, IS, NS */
  type: string;
  /** AO, AO-CAB */
  region: string;
  /** NOR, RED, INT, ISE, OUT, NS, NA */
  code: string;
  percentage: Money;
}

export interface SaftTaxTableEntry extends SaftTax {
  description: string;
}

export interface SaftLine {
  lineNumber: number;
  productCode: string;
  description: string;
  quantity: Money;
  unit: string;
  /** Per unit, without tax, after discounts. */
  unitPrice: Money;
  /** Without tax, after discounts: the line's DebitAmount or CreditAmount. */
  netAmount: Money;
  tax: SaftTax;
  exemption?: { code: string; reason: string } | null;
  /** Every discount on the line (its own and its share of the sale's). */
  settlementAmount: Money;
  /** What a credit note corrects. */
  reference?: { documentNo: string; reason?: string | null } | null;
}

export interface SaftDocument {
  documentNo: string;
  /** The entry it was posted in (integrated accounting). */
  transactionId?: string | null;
  /** FT, FR, NC, ND… (sales) or PF, OR… (working documents). */
  documentType: string;
  /** N, A (and F for an invoiced proforma). */
  status: string;
  /** YYYY-MM-DDThh:mm:ss, the shop's clock. */
  statusDateTime: string;
  statusReason?: string | null;
  /** Who set the current status. */
  statusSourceId: string;
  sourceBilling: string;
  hash: string;
  hashControl: string;
  period: number;
  /** YYYY-MM-DD */
  date: string;
  systemEntryDateTime: string;
  /** Who issued it. */
  sourceId: string;
  customerId: string;
  lines: SaftLine[];
  taxPayable: Money;
  netTotal: Money;
  grossTotal: Money;
  /** How it was paid (FR), by SAF-T PaymentMechanism. */
  payments: { mechanism: string; amount: Money; date: string }[];
}

/** A receipt (RC) for invoices bought on credit. */
export interface SaftPayment {
  paymentRefNo: string;
  /** The entry it was posted in (integrated accounting). */
  transactionId?: string | null;
  /** RC, RG */
  paymentType: string;
  period: number;
  transactionDate: string;
  status: string;
  statusDateTime: string;
  statusReason?: string | null;
  statusSourceId: string;
  sourceId: string;
  systemEntryDateTime: string;
  customerId: string;
  methods: { mechanism: string; amount: Money; date: string }[];
  /** One line per invoice settled; amount without tax (CreditAmount). */
  lines: { lineNumber: number; originatingOn: string; invoiceDate: string; amount: Money }[];
  netTotal: Money;
  taxPayable: Money;
  grossTotal: Money;
}

export interface SaftSupplier {
  id: string;
  /** The supplier's account in the chart (AccountID); "Desconhecido" without one. */
  accountId?: string | null;
  /** NIF; "999999999" when unknown. */
  taxId: string;
  name: string;
  contact?: string | null;
  address: SaftAddress;
  phone?: string | null;
  email?: string | null;
}

/** A supplier's document for a purchase (SAF-T PurchaseInvoices). */
export interface SaftPurchaseInvoice {
  /** The supplier's number, as on their document. */
  invoiceNo: string;
  /** The 4 hash characters on it, or "0". */
  hash: string;
  sourceId: string;
  period: number;
  date: string;
  /** FT, FR, NC... */
  purchaseType: string;
  supplierId: string;
  taxPayable: Money;
  netTotal: Money;
  grossTotal: Money;
  deductible: { taxBase: Money; amount: Money; percentage: Money; type: string }[];
  /** IVA cativo: percent and amount. */
  withholding?: { percent: Money; amount: Money } | null;
}

/** An account of the chart with its balances at the start and end of the period (GeneralLedgerAccounts). */
export interface SaftLedgerAccount {
  id: string;
  description: string;
  openingDebit: Money;
  openingCredit: Money;
  closingDebit: Money;
  closingCredit: Money;
  /** GR, GA, GM (AR, AA, AM) */
  category: string;
  /** The aggregating account one level up (not for first-degree accounts). */
  groupingCode?: string | null;
}

export interface SaftLedgerLine {
  recordId: string;
  accountId: string;
  sourceDocumentId?: string | null;
  systemEntryDateTime: string;
  description: string;
  debit?: Money | null;
  credit?: Money | null;
}

export interface SaftTransaction {
  /** "YYYY-MM-DD JournalID DocArchivalNumber" */
  id: string;
  period: number;
  date: string;
  sourceId: string;
  description: string;
  docArchivalNumber: string;
  /** N, R, A, J */
  type: string;
  postingDate: string;
  customerId?: string | null;
  supplierId?: string | null;
  lines: SaftLedgerLine[];
}

export interface GeneralLedgerInput {
  accounts: SaftLedgerAccount[];
  journals: { id: string; description: string; transactions: SaftTransaction[] }[];
}

export interface FacturacaoInput {
  /** F (invoicing, default), I (accounting integrated with invoicing), A (purchases: Aquisição de Bens e Serviços). */
  taxAccountingBasis?: "F" | "I" | "A";
  /** The chart and the entries, for an "I" file. */
  generalLedger?: GeneralLedgerInput | null;
  company: SaftCompany;
  software: SaftSoftware;
  fiscalYear: number;
  startDate: string;
  endDate: string;
  /** YYYY-MM-DD */
  dateCreated: string;
  /** "Global", or the store the file is for. */
  taxEntity: string;
  customers: SaftCustomer[];
  suppliers: SaftSupplier[];
  products: SaftProduct[];
  taxTable: SaftTaxTableEntry[];
  salesInvoices: SaftDocument[];
  workingDocuments: SaftDocument[];
  payments: SaftPayment[];
  purchaseInvoices: SaftPurchaseInvoice[];
}

const ZERO = new Prisma.Decimal(0);
/** Monetary fields with exactly two decimals (totals). */
const m2 = (v: Money) => v.toFixed(2);
/** Other monetary and decimal fields: as precise as stored, no trailing zeros. */
const dec = (v: Money) => v.toString();

/** Credit notes are debits to sales; everything else sold is a credit. */
export function isDebitDocument(documentType: string): boolean {
  return documentType === "NC";
}

function address(w: XmlWriter, tag: string, a: SaftAddress, opts: { angola?: boolean } = {}) {
  w.open(tag);
  w.el("AddressDetail", text(a.detail, 250));
  w.el("City", text(a.city, 50));
  // The company's (Angolan) postal code is at most 10 characters, too short for "Desconhecido": left out when unknown.
  w.el("PostalCode", opts.angola ? optionalText(a.postalCode, 10) : text(a.postalCode, 20));
  w.el("Province", optionalText(a.province, 50));
  w.el("Country", opts.angola ? "AO" : text(a.country, 12, UNKNOWN));
  w.close(tag);
}

function tax(w: XmlWriter, t: SaftTax) {
  w.open("Tax");
  w.el("TaxType", t.type);
  w.el("TaxCountryRegion", t.region);
  w.el("TaxCode", t.code);
  w.el("TaxPercentage", dec(t.percentage));
  w.close("Tax");
}

function exemption(w: XmlWriter, line: SaftLine) {
  if (!line.exemption) return;
  w.el("TaxExemptionReason", text(line.exemption.reason, 60));
  w.el("TaxExemptionCode", line.exemption.code);
}

/** Debit and credit sums for a section, leaving out annulled documents. */
function sectionTotals(docs: { status: string; documentType: string; lines: { netAmount: Money }[] }[]) {
  let debit = ZERO;
  let credit = ZERO;
  for (const d of docs) {
    if (d.status === "A") continue;
    const sum = d.lines.reduce((s, l) => s.plus(l.netAmount), ZERO);
    if (isDebitDocument(d.documentType)) debit = debit.plus(sum);
    else credit = credit.plus(sum);
  }
  return { debit, credit };
}

/**
 * Documents with an exempt line (0%) that has no TaxExemptionCode. AGT
 * requires the code on every exempt line, so the file is never written with
 * one: the export refuses and names them.
 */
export function documentsMissingExemption(docs: Pick<SaftDocument, "documentNo" | "lines">[]): string[] {
  return docs.filter((d) => d.lines.some((l) => new Prisma.Decimal(l.tax.percentage).isZero() && !l.exemption?.code)).map((d) => d.documentNo);
}

export function buildFacturacaoXml(input: FacturacaoInput): string {
  const missing = documentsMissingExemption([...input.salesInvoices, ...input.workingDocuments]);
  if (missing.length) throw new Error(`Exempt lines without TaxExemptionCode in ${missing.join(", ")}`);
  const w = new XmlWriter();
  w.open("AuditFile", { xmlns: SAFT_NAMESPACE });

  const c = input.company;
  w.open("Header");
  w.el("AuditFileVersion", "1.01_01");
  w.el("CompanyID", text(c.companyId, 50));
  w.el("TaxRegistrationNumber", c.taxId);
  w.el("TaxAccountingBasis", input.taxAccountingBasis ?? "F");
  w.el("CompanyName", text(c.legalName, 200));
  w.el("BusinessName", c.businessName && c.businessName !== c.legalName ? optionalText(c.businessName, 60) : null);
  address(w, "CompanyAddress", c.address, { angola: true });
  w.el("FiscalYear", input.fiscalYear);
  w.el("StartDate", input.startDate);
  w.el("EndDate", input.endDate);
  w.el("CurrencyCode", "AOA");
  w.el("DateCreated", input.dateCreated);
  w.el("TaxEntity", text(input.taxEntity, 20));
  w.el("ProductCompanyTaxID", text(input.software.producerTaxId, 20));
  w.el("SoftwareValidationNumber", input.software.validationNumber);
  w.el("ProductID", input.software.productId);
  w.el("ProductVersion", text(input.software.version, 30));
  w.el("Telephone", optionalText(c.phone, 20));
  w.el("Email", optionalText(c.email, 255));
  w.el("Website", optionalText(c.website, 60));
  w.close("Header");

  w.open("MasterFiles");
  if (input.generalLedger?.accounts.length) {
    w.open("GeneralLedgerAccounts");
    for (const a of input.generalLedger.accounts) {
      w.open("Account");
      w.el("AccountID", a.id);
      w.el("AccountDescription", text(a.description, 100));
      w.el("OpeningDebitBalance", m2(a.openingDebit));
      w.el("OpeningCreditBalance", m2(a.openingCredit));
      w.el("ClosingDebitBalance", m2(a.closingDebit));
      w.el("ClosingCreditBalance", m2(a.closingCredit));
      w.el("GroupingCategory", a.category);
      w.el("GroupingCode", a.groupingCode ?? null);
      w.close("Account");
    }
    w.close("GeneralLedgerAccounts");
  }
  for (const cu of input.customers) {
    w.open("Customer");
    w.el("CustomerID", cu.id);
    w.el("AccountID", cu.accountId || UNKNOWN);
    w.el("CustomerTaxID", text(cu.taxId, 30));
    w.el("CompanyName", text(cu.name, 100));
    address(
      w,
      "BillingAddress",
      cu.finalConsumer ? { detail: UNKNOWN, city: UNKNOWN, postalCode: UNKNOWN, country: UNKNOWN } : { ...cu.address, country: cu.address.country || "AO" },
    );
    if (!cu.finalConsumer) {
      w.el("Telephone", optionalText(cu.phone, 20));
      w.el("Email", optionalText(cu.email, 255));
    }
    w.el("SelfBillingIndicator", 0);
    w.close("Customer");
  }
  for (const su of input.suppliers) {
    w.open("Supplier");
    w.el("SupplierID", su.id);
    w.el("AccountID", su.accountId || UNKNOWN);
    w.el("SupplierTaxID", text(su.taxId, 20));
    w.el("CompanyName", text(su.name, 100));
    w.el("Contact", optionalText(su.contact, 50));
    w.open("BillingAddress");
    w.el("AddressDetail", text(su.address.detail, 250));
    w.el("City", text(su.address.city, 50));
    w.el("PostalCode", text(su.address.postalCode, 20));
    w.el("Province", optionalText(su.address.province, 50));
    // Suppliers' countries are ISO codes only (no "Desconhecido").
    w.el("Country", /^[A-Z]{2}$/.test(su.address.country ?? "") ? su.address.country : "AO");
    w.close("BillingAddress");
    w.el("Telephone", optionalText(su.phone, 20));
    w.el("Email", optionalText(su.email, 255));
    w.el("SelfBillingIndicator", 0);
    w.close("Supplier");
  }
  for (const p of input.products) {
    w.open("Product");
    w.el("ProductType", p.type);
    w.el("ProductCode", text(p.code, 60));
    w.el("ProductGroup", optionalText(p.group, 50));
    w.el("ProductDescription", text(p.description, 200));
    w.el("ProductNumberCode", text(p.numberCode, 60));
    w.close("Product");
  }
  if (input.taxTable.length) {
    w.open("TaxTable");
    for (const t of input.taxTable) {
      w.open("TaxTableEntry");
      w.el("TaxType", t.type);
      w.el("TaxCountryRegion", t.region);
      w.el("TaxCode", t.code);
      w.el("Description", text(t.description, 255));
      w.el("TaxPercentage", dec(t.percentage));
      w.close("TaxTableEntry");
    }
    w.close("TaxTable");
  }
  w.close("MasterFiles");

  if (input.generalLedger) generalLedgerEntries(w, input.generalLedger);

  w.open("SourceDocuments");
  // The purchases file has its purchases only.
  if (input.taxAccountingBasis !== "A") salesInvoices(w, input.salesInvoices);
  if (input.workingDocuments.length) workingDocuments(w, input.workingDocuments);
  if (input.payments.length) payments(w, input.payments);
  if (input.purchaseInvoices.length) purchaseInvoices(w, input.purchaseInvoices);
  w.close("SourceDocuments");

  w.close("AuditFile");
  return w.toString();
}

function salesInvoices(w: XmlWriter, docs: SaftDocument[]) {
  const totals = sectionTotals(docs);
  w.open("SalesInvoices");
  w.el("NumberOfEntries", docs.length);
  w.el("TotalDebit", m2(totals.debit));
  w.el("TotalCredit", m2(totals.credit));
  for (const d of docs) {
    w.open("Invoice");
    w.el("InvoiceNo", d.documentNo);
    w.open("DocumentStatus");
    w.el("InvoiceStatus", d.status);
    w.el("InvoiceStatusDate", d.statusDateTime);
    w.el("Reason", d.status === "A" ? optionalText(d.statusReason, 50) : null);
    w.el("SourceID", text(d.statusSourceId, 30));
    w.el("SourceBilling", d.sourceBilling);
    w.close("DocumentStatus");
    w.el("Hash", d.hash);
    w.el("HashControl", d.hashControl);
    w.el("Period", d.period);
    w.el("InvoiceDate", d.date);
    w.el("InvoiceType", d.documentType);
    w.open("SpecialRegimes");
    w.el("SelfBillingIndicator", 0);
    w.el("CashVATSchemeIndicator", 0);
    w.el("ThirdPartiesBillingIndicator", 0);
    w.close("SpecialRegimes");
    w.el("SourceID", text(d.sourceId, 30));
    w.el("SystemEntryDate", d.systemEntryDateTime);
    w.el("TransactionID", d.transactionId ?? null);
    w.el("CustomerID", d.customerId);
    const debit = isDebitDocument(d.documentType);
    for (const l of d.lines) {
      w.open("Line");
      w.el("LineNumber", l.lineNumber);
      w.el("ProductCode", text(l.productCode, 60));
      w.el("ProductDescription", text(l.description, 200));
      w.el("Quantity", dec(l.quantity));
      w.el("UnitOfMeasure", text(l.unit, 20));
      w.el("UnitPrice", dec(l.unitPrice));
      w.el("TaxPointDate", d.date);
      if (l.reference) {
        w.open("References");
        w.el("Reference", text(l.reference.documentNo, 60));
        w.el("Reason", optionalText(l.reference.reason, 50));
        w.close("References");
      }
      w.el("Description", text(l.description, 200));
      w.el(debit ? "DebitAmount" : "CreditAmount", dec(l.netAmount));
      tax(w, l.tax);
      exemption(w, l);
      if (l.settlementAmount.gt(0)) w.el("SettlementAmount", dec(l.settlementAmount));
      w.close("Line");
    }
    w.open("DocumentTotals");
    w.el("TaxPayable", m2(d.taxPayable));
    w.el("NetTotal", m2(d.netTotal));
    w.el("GrossTotal", m2(d.grossTotal));
    for (const p of d.payments) {
      w.open("Payment");
      w.el("PaymentMechanism", p.mechanism);
      w.el("PaymentAmount", dec(p.amount));
      w.el("PaymentDate", p.date);
      w.close("Payment");
    }
    w.close("DocumentTotals");
    w.close("Invoice");
  }
  w.close("SalesInvoices");
}

function workingDocuments(w: XmlWriter, docs: SaftDocument[]) {
  const totals = sectionTotals(docs);
  w.open("WorkingDocuments");
  w.el("NumberOfEntries", docs.length);
  w.el("TotalDebit", m2(totals.debit));
  w.el("TotalCredit", m2(totals.credit));
  for (const d of docs) {
    w.open("WorkDocument");
    w.el("DocumentNumber", d.documentNo);
    w.open("DocumentStatus");
    w.el("WorkStatus", d.status);
    w.el("WorkStatusDate", d.statusDateTime);
    w.el("Reason", d.status === "A" ? optionalText(d.statusReason, 50) : null);
    w.el("SourceID", text(d.statusSourceId, 30));
    w.el("SourceBilling", d.sourceBilling);
    w.close("DocumentStatus");
    w.el("Hash", d.hash);
    w.el("HashControl", d.hashControl);
    w.el("Period", d.period);
    w.el("WorkDate", d.date);
    w.el("WorkType", d.documentType);
    w.el("SourceID", text(d.sourceId, 30));
    w.el("SystemEntryDate", d.systemEntryDateTime);
    w.el("TransactionID", d.transactionId ?? null);
    w.el("CustomerID", d.customerId);
    for (const l of d.lines) {
      w.open("Line");
      w.el("LineNumber", l.lineNumber);
      w.el("ProductCode", text(l.productCode, 60));
      w.el("ProductDescription", text(l.description, 200));
      w.el("Quantity", dec(l.quantity));
      w.el("UnitOfMeasure", text(l.unit, 20));
      w.el("UnitPrice", dec(l.unitPrice));
      w.el("TaxPointDate", d.date);
      w.el("Description", text(l.description, 200));
      w.el("CreditAmount", dec(l.netAmount));
      tax(w, l.tax);
      exemption(w, l);
      if (l.settlementAmount.gt(0)) w.el("SettlementAmount", dec(l.settlementAmount));
      w.close("Line");
    }
    w.open("DocumentTotals");
    w.el("TaxPayable", m2(d.taxPayable));
    w.el("NetTotal", m2(d.netTotal));
    w.el("GrossTotal", m2(d.grossTotal));
    w.close("DocumentTotals");
    w.close("WorkDocument");
  }
  w.close("WorkingDocuments");
}

function payments(w: XmlWriter, receipts: SaftPayment[]) {
  // Each line settles an invoice and is a CreditAmount; the total leaves out annulled receipts.
  let credit = ZERO;
  for (const r of receipts) if (r.status !== "A") credit = credit.plus(r.lines.reduce((s, l) => s.plus(l.amount), ZERO));
  w.open("Payments");
  w.el("NumberOfEntries", receipts.length);
  w.el("TotalDebit", m2(ZERO));
  w.el("TotalCredit", m2(credit));
  for (const r of receipts) {
    w.open("Payment");
    w.el("PaymentRefNo", r.paymentRefNo);
    w.el("Period", r.period);
    w.el("TransactionID", r.transactionId ?? null);
    w.el("TransactionDate", r.transactionDate);
    w.el("PaymentType", r.paymentType);
    w.open("DocumentStatus");
    w.el("PaymentStatus", r.status);
    w.el("PaymentStatusDate", r.statusDateTime);
    w.el("Reason", r.status === "A" ? optionalText(r.statusReason, 50) : null);
    w.el("SourceID", text(r.statusSourceId, 30));
    w.el("SourcePayment", "P");
    w.close("DocumentStatus");
    for (const m of r.methods) {
      w.open("PaymentMethod");
      w.el("PaymentMechanism", m.mechanism);
      w.el("PaymentAmount", dec(m.amount));
      w.el("PaymentDate", m.date);
      w.close("PaymentMethod");
    }
    w.el("SourceID", text(r.sourceId, 30));
    w.el("SystemEntryDate", r.systemEntryDateTime);
    w.el("CustomerID", r.customerId);
    for (const l of r.lines) {
      w.open("Line");
      w.el("LineNumber", l.lineNumber);
      w.open("SourceDocumentID");
      w.el("OriginatingON", text(l.originatingOn, 60));
      w.el("InvoiceDate", l.invoiceDate);
      w.close("SourceDocumentID");
      w.el("CreditAmount", dec(l.amount));
      w.close("Line");
    }
    w.open("DocumentTotals");
    w.el("TaxPayable", m2(r.taxPayable));
    w.el("NetTotal", m2(r.netTotal));
    w.el("GrossTotal", m2(r.grossTotal));
    w.close("DocumentTotals");
    w.close("Payment");
  }
  w.close("Payments");
}

function purchaseInvoices(w: XmlWriter, invoices: SaftPurchaseInvoice[]) {
  w.open("PurchaseInvoices");
  w.el("NumberOfEntries", invoices.length);
  for (const p of invoices) {
    w.open("Invoice");
    w.el("InvoiceNo", text(p.invoiceNo, 60));
    w.el("Hash", text(p.hash, 172, "0"));
    w.el("SourceID", text(p.sourceId, 30));
    w.el("Period", p.period);
    w.el("InvoiceDate", p.date);
    w.el("PurchaseType", p.purchaseType);
    w.el("SupplierID", p.supplierId);
    w.open("DocumentTotals");
    w.el("TaxPayable", m2(p.taxPayable));
    w.el("NetTotal", m2(p.netTotal));
    w.el("GrossTotal", m2(p.grossTotal));
    for (const d of p.deductible) {
      w.open("Deductible");
      w.el("TaxBase", m2(d.taxBase));
      w.el("DeductibleAmount", m2(d.amount));
      w.el("DeductiblePercentage", dec(d.percentage));
      w.el("DeductibleTaxType", d.type);
      w.close("Deductible");
    }
    w.close("DocumentTotals");
    if (p.withholding && p.withholding.amount.gt(0)) {
      w.open("WithholdingTax");
      w.el("WithholdingTaxType", "IVA");
      w.el("WithholdingTaxDescription", p.withholding.percent.toFixed(2));
      w.el("WithholdingTaxAmount", dec(p.withholding.amount));
      w.close("WithholdingTax");
    }
    w.close("Invoice");
  }
  w.close("PurchaseInvoices");
}

/**
 * GeneralLedgerEntries: the period's entries by journal (never the opening,
 * which is only in the accounts' opening balances), debit lines first.
 */
function generalLedgerEntries(w: XmlWriter, gl: GeneralLedgerInput) {
  const transactions = gl.journals.flatMap((j) => j.transactions);
  const sum = (side: "debit" | "credit") => transactions.reduce((s, t) => t.lines.reduce((x, l) => x.plus(l[side] ?? ZERO), s), ZERO);
  w.open("GeneralLedgerEntries");
  w.el("NumberOfEntries", transactions.length);
  w.el("TotalDebit", m2(sum("debit")));
  w.el("TotalCredit", m2(sum("credit")));
  for (const j of gl.journals) {
    w.open("Journal");
    w.el("JournalID", j.id);
    w.el("Description", text(j.description, 60));
    for (const t of j.transactions) {
      w.open("Transaction");
      w.el("TransactionID", t.id);
      w.el("Period", t.period);
      w.el("TransactionDate", t.date);
      w.el("SourceID", text(t.sourceId, 30));
      w.el("Description", text(t.description, 200));
      w.el("DocArchivalNumber", t.docArchivalNumber);
      w.el("TransactionType", t.type);
      w.el("GLPostingDate", t.postingDate);
      if (t.customerId) w.el("CustomerID", t.customerId);
      else if (t.supplierId) w.el("SupplierID", t.supplierId);
      w.open("Lines");
      for (const side of ["debit", "credit"] as const) {
        for (const l of t.lines) {
          const amount = l[side];
          if (!amount || amount.isZero()) continue;
          const tag = side === "debit" ? "DebitLine" : "CreditLine";
          w.open(tag);
          w.el("RecordID", text(l.recordId, 30));
          w.el("AccountID", l.accountId);
          w.el("SourceDocumentID", optionalText(l.sourceDocumentId, 30));
          w.el("SystemEntryDate", l.systemEntryDateTime);
          w.el("Description", text(l.description, 200));
          w.el(side === "debit" ? "DebitAmount" : "CreditAmount", m2(amount));
          w.close(tag);
        }
      }
      w.close("Lines");
      w.close("Transaction");
    }
    w.close("Journal");
  }
  w.close("GeneralLedgerEntries");
}

/** The builder serves both files: "F" (invoicing) and "I" (integrated accounting). */
export const buildSaftXml = buildFacturacaoXml;
