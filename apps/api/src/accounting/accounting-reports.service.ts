import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LedgerAccount, Prisma } from "@prisma/client";
import { CustomerAccountsService } from "../accounts/customer-accounts.service";
import { SupplierAccountsService } from "../accounts/supplier-accounts.service";
import { buildXlsx, XlsxCell } from "../common/xlsx";
import { PrismaService } from "../prisma/prisma.service";
import { businessToday, dateValue, isoDate } from "./accounting-dates";
import { compareCodes } from "./chart";
import { ZERO } from "./entry-rules";
import { periodDates } from "./periods";
import { ageBucket, AGE_BUCKETS, balanceSheet, incomeStatement, StatementLine } from "./statements";

export const ACCOUNTING_REPORTS = ["trialBalance", "ledger", "journal", "statement", "ageing", "balanceSheet", "incomeStatement", "vat"] as const;
export type AccountingReport = (typeof ACCOUNTING_REPORTS)[number];

type Money = Prisma.Decimal;
export type Cell = string | number | null;
/** text, code (as is), label (a translation key), money, date, count, percent. */
export type ColumnKind = "text" | "code" | "label" | "money" | "date" | "count" | "percent";

export interface ReportTable {
  title?: string;
  columns: { key: string; kind: ColumnKind }[];
  rows: Record<string, Cell>[];
  totals: Record<string, Cell> | null;
}

export interface ReportParams {
  year?: number;
  fromPeriod?: number;
  toPeriod?: number;
  /** Balancete: how deep (1 = first-degree accounts); 0 = every account. */
  level?: number;
  accountId?: string;
  journalId?: string;
  party?: "customer" | "supplier";
  partyId?: string;
}

const money = (v: Money) => v.toFixed(2);
const nz = (v: Money) => (v.isZero() ? null : money(v));

/**
 * The accounting reports (docs/ACCOUNTING-DECISIONS.md, step A6): read
 * from the posted entries only. Each is a few tables the app shows,
 * prints and saves as PDF; the server also writes them as Excel.
 */
@Injectable()
export class AccountingReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomerAccountsService,
    private readonly suppliers: SupplierAccountsService,
  ) {}

  async build(businessId: string, report: AccountingReport, p: ReportParams, userId?: string) {
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const accountant = await this.accountantFor(businessId, userId);
    const today = businessToday(business);
    const year = p.year ?? Number(today.slice(0, 4));
    const fromPeriod = p.fromPeriod ?? 0;
    const toPeriod = p.toPeriod ?? 15;
    if (fromPeriod < 0 || toPeriod > 15 || fromPeriod > toPeriod) throw new BadRequestException("Periods go from 0 to 15, the first before the last");
    const range = { year, fromPeriod, toPeriod };
    let tables: ReportTable[];
    switch (report) {
      case "trialBalance":
        tables = await this.trialBalance(businessId, range, p.level ?? 0);
        break;
      case "ledger":
        tables = await this.ledger(businessId, range, p.accountId);
        break;
      case "journal":
        tables = await this.journal(businessId, range, p.journalId);
        break;
      case "statement":
        tables = await this.statement(businessId, range, p.party ?? "customer", p.partyId);
        break;
      case "ageing":
        tables = await this.ageing(businessId, p.party ?? "customer", today);
        break;
      case "balanceSheet":
        tables = await this.balanceSheet(businessId, range);
        break;
      case "incomeStatement":
        tables = await this.incomeStatement(businessId, range);
        break;
      case "vat":
        tables = await this.vat(businessId, range);
        break;
      default:
        throw new NotFoundException("Report not found");
    }
    return { report, year, fromPeriod, toPeriod, company: { name: business.legalName || business.name, taxId: business.taxId }, accountant, tables };
  }

  /**
   * The accountant whose name and OCPCA number go on the statements: the
   * accountant asking for them, else the company's first accountant.
   */
  private async accountantFor(businessId: string, userId?: string): Promise<{ name: string; ocpcaNumber: string | null } | null> {
    const access = await this.prisma.accountantAccess.findMany({
      where: { businessId, revokedAt: null },
      include: { user: { select: { id: true, firstName: true, lastName: true, ocpcaNumber: true } } },
      orderBy: { createdAt: "asc" },
    });
    const a = access.find((x) => x.userId === userId) ?? access[0];
    return a ? { name: `${a.user.firstName} ${a.user.lastName}`, ocpcaNumber: a.user.ocpcaNumber } : null;
  }

  // ---------------------------------------------------------------- queries

  private accounts(businessId: string) {
    return this.prisma.ledgerAccount.findMany({ where: { businessId } });
  }

  /** Debits and credits per movement account over periods of a year (optionally leaving out the apuramento). */
  private async sums(businessId: string, year: number, fromPeriod: number, toPeriod: number, opts: { withoutResults?: boolean } = {}) {
    const rows = await this.prisma.$queryRaw<{ accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[]>`
      SELECT l."accountId", SUM(l.debit) AS debit, SUM(l.credit) AS credit
      FROM "journal_entry_lines" l JOIN "journal_entries" e ON e.id = l."entryId"
      WHERE e."businessId" = ${businessId} AND e.year = ${year} AND e.period BETWEEN ${fromPeriod} AND ${toPeriod}
        ${opts.withoutResults ? Prisma.sql`AND e."transactionType" <> 'A'` : Prisma.empty}
      GROUP BY l."accountId"`;
    return new Map(rows.map((r) => [r.accountId, { debit: new Prisma.Decimal(r.debit), credit: new Prisma.Decimal(r.credit) }]));
  }

  /** Movement accounts' balances (debit − credit) with their codes. */
  private async balances(businessId: string, year: number, fromPeriod: number, toPeriod: number, opts: { withoutResults?: boolean } = {}) {
    const [accounts, sums] = await Promise.all([this.accounts(businessId), this.sums(businessId, year, fromPeriod, toPeriod, opts)]);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return [...sums.entries()].map(([id, s]) => ({ code: byId.get(id)!.code, balance: s.debit.minus(s.credit) }));
  }

  // ---------------------------------------------------------------- reports

  /**
   * Balancete: opening balance (before the first period), the periods'
   * movements, the year's accumulated movements and the balance, for every
   * account with movements, rolled up to its aggregating accounts.
   */
  private async trialBalance(businessId: string, r: { year: number; fromPeriod: number; toPeriod: number }, level: number): Promise<ReportTable[]> {
    const [accounts, before, during] = await Promise.all([
      this.accounts(businessId),
      r.fromPeriod > 0 ? this.sums(businessId, r.year, 0, r.fromPeriod - 1) : Promise.resolve(new Map()),
      this.sums(businessId, r.year, r.fromPeriod, r.toPeriod),
    ]);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    type Totals = { od: Money; oc: Money; pd: Money; pc: Money };
    const totals = new Map<string, Totals>();
    const add = (id: string, f: (t: Totals) => void) => {
      for (let a: LedgerAccount | undefined = byId.get(id); a; a = a.parentId ? byId.get(a.parentId) : undefined) {
        const t = totals.get(a.id) ?? { od: ZERO, oc: ZERO, pd: ZERO, pc: ZERO };
        f(t);
        totals.set(a.id, t);
      }
    };
    for (const [id, s] of before) add(id, (t) => ((t.od = t.od.plus(s.debit)), (t.oc = t.oc.plus(s.credit))));
    for (const [id, s] of during) add(id, (t) => ((t.pd = t.pd.plus(s.debit)), (t.pc = t.pc.plus(s.credit))));
    const depth = (code: string) => code.split(".").length;
    const shown = accounts.filter((a) => totals.has(a.id) && (level === 0 || depth(a.code) <= level)).sort((a, b) => compareCodes(a.code, b.code));
    const rows = shown.map((a) => {
      const t = totals.get(a.id)!;
      const opening = t.od.minus(t.oc);
      const ad = t.od.plus(t.pd);
      const ac = t.oc.plus(t.pc);
      const bal = ad.minus(ac);
      return {
        code: a.code,
        name: a.name,
        openingDebit: opening.gt(0) ? money(opening) : null,
        openingCredit: opening.lt(0) ? money(opening.negated()) : null,
        periodDebit: nz(t.pd),
        periodCredit: nz(t.pc),
        accumulatedDebit: nz(ad),
        accumulatedCredit: nz(ac),
        balanceDebit: bal.gt(0) ? money(bal) : null,
        balanceCredit: bal.lt(0) ? money(bal.negated()) : null,
        _level: depth(a.code),
      };
    });
    // Totals from the first-degree accounts only (each movement counted once).
    const gr = shown.filter((a) => !a.parentId).map((a) => totals.get(a.id)!);
    const sum = (f: (t: Totals) => Money) => gr.reduce((s, t) => s.plus(f(t)), ZERO);
    const balanceOf = (t: Totals) => t.od.plus(t.pd).minus(t.oc).minus(t.pc);
    return [
      {
        columns: [
          { key: "code", kind: "code" },
          { key: "name", kind: "text" },
          { key: "openingDebit", kind: "money" },
          { key: "openingCredit", kind: "money" },
          { key: "periodDebit", kind: "money" },
          { key: "periodCredit", kind: "money" },
          { key: "accumulatedDebit", kind: "money" },
          { key: "accumulatedCredit", kind: "money" },
          { key: "balanceDebit", kind: "money" },
          { key: "balanceCredit", kind: "money" },
        ],
        rows,
        totals: {
          code: null,
          name: null,
          openingDebit: money(gr.reduce((s, t) => (t.od.minus(t.oc).gt(0) ? s.plus(t.od.minus(t.oc)) : s), ZERO)),
          openingCredit: money(gr.reduce((s, t) => (t.od.minus(t.oc).lt(0) ? s.minus(t.od.minus(t.oc)) : s), ZERO)),
          periodDebit: money(sum((t) => t.pd)),
          periodCredit: money(sum((t) => t.pc)),
          accumulatedDebit: money(sum((t) => t.od.plus(t.pd))),
          accumulatedCredit: money(sum((t) => t.oc.plus(t.pc))),
          balanceDebit: money(gr.reduce((s, t) => (balanceOf(t).gt(0) ? s.plus(balanceOf(t)) : s), ZERO)),
          balanceCredit: money(gr.reduce((s, t) => (balanceOf(t).lt(0) ? s.minus(balanceOf(t)) : s), ZERO)),
        },
      },
    ];
  }

  /** Razão: an account's (and its sub-accounts') movements with a running balance, after the balance brought forward. */
  private async ledger(businessId: string, r: { year: number; fromPeriod: number; toPeriod: number }, accountId?: string): Promise<ReportTable[]> {
    if (!accountId) throw new BadRequestException("Choose an account");
    const accounts = await this.accounts(businessId);
    const account = accounts.find((a) => a.id === accountId);
    if (!account) throw new NotFoundException("Account not found");
    const ids = accounts.filter((a) => a.code === account.code || a.code.startsWith(`${account.code}.`)).map((a) => a.id);
    const opening = r.fromPeriod > 0 ? await this.sums(businessId, r.year, 0, r.fromPeriod - 1) : new Map<string, { debit: Money; credit: Money }>();
    let balance = ids.reduce((s, id) => s.plus(opening.get(id)?.debit ?? ZERO).minus(opening.get(id)?.credit ?? ZERO), ZERO);
    const lines = await this.prisma.journalEntryLine.findMany({
      where: { accountId: { in: ids }, entry: { businessId, year: r.year, period: { gte: r.fromPeriod, lte: r.toPeriod } } },
      include: { entry: { include: { journal: { select: { code: true } } } }, account: { select: { code: true } } },
      orderBy: [{ entry: { postingDate: "asc" } }, { entry: { createdAt: "asc" } }, { lineNumber: "asc" }],
    });
    const rows: Record<string, Cell>[] = [{ date: null, entry: null, account: null, description: "openingBalance", source: null, debit: null, credit: null, balance: money(balance), _label: 1 }];
    let debit = ZERO;
    let credit = ZERO;
    for (const l of lines) {
      balance = balance.plus(l.debit).minus(l.credit);
      debit = debit.plus(l.debit);
      credit = credit.plus(l.credit);
      rows.push({
        date: isoDate(l.entry.postingDate),
        entry: `${l.entry.journal.code} ${l.entry.docArchivalNumber}`,
        account: l.account.code,
        description: l.description,
        source: l.sourceDocumentId,
        debit: nz(l.debit),
        credit: nz(l.credit),
        balance: money(balance),
      });
    }
    return [
      {
        title: `${account.code} ${account.name}`,
        columns: [
          { key: "date", kind: "date" },
          { key: "entry", kind: "code" },
          { key: "account", kind: "code" },
          { key: "description", kind: "text" },
          { key: "source", kind: "code" },
          { key: "debit", kind: "money" },
          { key: "credit", kind: "money" },
          { key: "balance", kind: "money" },
        ],
        rows,
        totals: { date: null, entry: null, account: null, description: null, source: null, debit: money(debit), credit: money(credit), balance: money(balance) },
      },
    ];
  }

  /** Diário: every entry of the periods (one journal or all), line by line. */
  private async journal(businessId: string, r: { year: number; fromPeriod: number; toPeriod: number }, journalId?: string): Promise<ReportTable[]> {
    const entries = await this.prisma.journalEntry.findMany({
      where: { businessId, year: r.year, period: { gte: r.fromPeriod, lte: r.toPeriod }, ...(journalId ? { journalId } : {}) },
      include: { journal: { select: { code: true } }, lines: { orderBy: { lineNumber: "asc" }, include: { account: { select: { code: true, name: true } } } } },
      orderBy: [{ journal: { code: "asc" } }, { number: "asc" }],
    });
    const rows: Record<string, Cell>[] = [];
    let debit = ZERO;
    for (const e of entries) {
      e.lines.forEach((l, i) => {
        rows.push({
          date: i === 0 ? isoDate(e.postingDate) : null,
          entry: i === 0 ? `${e.journal.code} ${e.docArchivalNumber}` : null,
          period: i === 0 ? e.period : null,
          type: i === 0 ? e.transactionType : null,
          account: l.account.code,
          description: i === 0 ? e.description : l.description !== e.description ? l.description : l.account.name,
          debit: nz(l.debit),
          credit: nz(l.credit),
        });
      });
      debit = debit.plus(e.totalDebit);
    }
    return [
      {
        columns: [
          { key: "date", kind: "date" },
          { key: "entry", kind: "code" },
          { key: "period", kind: "count" },
          { key: "type", kind: "code" },
          { key: "account", kind: "code" },
          { key: "description", kind: "text" },
          { key: "debit", kind: "money" },
          { key: "credit", kind: "money" },
        ],
        rows,
        totals: { date: null, entry: null, period: null, type: null, account: null, description: `${entries.length}`, debit: money(debit), credit: money(debit) },
      },
    ];
  }

  /** Extracto de conta corrente: one customer's or supplier's account (or each in turn), with a running balance. */
  private async statement(businessId: string, r: { year: number; fromPeriod: number; toPeriod: number }, party: "customer" | "supplier", partyId?: string): Promise<ReportTable[]> {
    const linkType = party === "customer" ? "CUSTOMER" : "SUPPLIER";
    const accounts = await this.prisma.ledgerAccount.findMany({ where: { businessId, linkType, ...(partyId ? { linkId: partyId } : {}) }, orderBy: { code: "asc" } });
    const tables: ReportTable[] = [];
    for (const a of accounts) {
      const [t] = await this.ledger(businessId, r, a.id);
      if (t.rows.length > 1 || t.rows[0].balance !== "0.00") tables.push(t);
    }
    return tables;
  }

  /** Ageing of what customers owe (open invoices) or what is owed to suppliers (open purchases), by days since the document. */
  private async ageing(businessId: string, party: "customer" | "supplier", today: string): Promise<ReportTable[]> {
    type Row = { name: string; taxId: string | null; buckets: Record<string, Money> };
    const rows = new Map<string, Row>();
    const addTo = (id: string, name: string, taxId: string | null, date: string, open: Money) => {
      const row = rows.get(id) ?? { name, taxId, buckets: Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, ZERO])) };
      const k = ageBucket(date, today);
      row.buckets[k] = row.buckets[k].plus(open);
      rows.set(id, row);
    };
    if (party === "customer") {
      const people = await this.prisma.customer.findMany({ where: { businessId, isFinalConsumer: false }, select: { id: true, name: true, taxId: true } });
      const byId = new Map(people.map((c) => [c.id, c]));
      for (const i of await this.customers.invoices(this.prisma, businessId, people.map((c) => c.id), { openOnly: true })) {
        const c = byId.get(i.customerId)!;
        addTo(c.id, c.name, c.taxId, i.date, i.open);
      }
    } else {
      const people = await this.prisma.supplier.findMany({ where: { businessId }, select: { id: true, name: true, taxId: true } });
      const byId = new Map(people.map((s) => [s.id, s]));
      for (const p of await this.suppliers.purchases(this.prisma, businessId, people.map((s) => s.id), { openOnly: true })) {
        const s = byId.get(p.supplierId)!;
        addTo(s.id, s.name, s.taxId, p.date, p.open);
      }
    }
    const list = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
    const total = (k: string) => list.reduce((s, r) => s.plus(r.buckets[k]), ZERO);
    const all = (r: Row) => AGE_BUCKETS.reduce((s, b) => s.plus(r.buckets[b.key]), ZERO);
    return [
      {
        columns: [
          { key: "name", kind: "text" },
          { key: "taxId", kind: "code" },
          ...AGE_BUCKETS.map((b) => ({ key: b.key, kind: "money" as const })),
          { key: "total", kind: "money" },
        ],
        rows: list.map((r) => ({ name: r.name, taxId: r.taxId, ...Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, nz(r.buckets[b.key])])), total: money(all(r)) })),
        totals: { name: null, taxId: null, ...Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, money(total(b.key))])), total: money(list.reduce((s, r) => s.plus(all(r)), ZERO)) },
      },
    ];
  }

  private statementTable(lines: StatementLine[]): ReportTable {
    return {
      columns: [
        { key: "line", kind: "label" },
        { key: "amount", kind: "money" },
      ],
      rows: lines.map((l) => ({ line: l.key, amount: l.amount ? money(l.amount) : null, _style: l.kind })),
      totals: null,
    };
  }

  /** Balanço at the end of the last period (from the opening of the year). */
  private async balanceSheet(businessId: string, r: { year: number; toPeriod: number }): Promise<ReportTable[]> {
    const s = balanceSheet(await this.balances(businessId, r.year, 0, r.toPeriod));
    return [this.statementTable(s.lines)];
  }

  /** Demonstração de resultados por natureza over the periods (without the apuramento). */
  private async incomeStatement(businessId: string, r: { year: number; fromPeriod: number; toPeriod: number }): Promise<ReportTable[]> {
    const s = incomeStatement(await this.balances(businessId, r.year, Math.max(1, r.fromPeriod), r.toPeriod, { withoutResults: true }));
    return [this.statementTable(s.lines)];
  }

  /**
   * IVA working papers for the months in the range: IVA charged by rate and
   * exemption (sales documents less credit notes, annulled ones left out),
   * deductible IVA by type (purchases), IVA cativo, 7% on turnover for
   * stores in the Regime Simplificado, and the IVA accounts' balances to
   * check against.
   */
  private async vat(businessId: string, r: { year: number; fromPeriod: number; toPeriod: number }): Promise<ReportTable[]> {
    const from = periodDates(r.year, Math.max(1, Math.min(12, r.fromPeriod))).startDate;
    const to = periodDates(r.year, Math.max(1, Math.min(12, r.toPeriod))).endDate;
    const charged = await this.prisma.$queryRaw<{ code: string; percentage: Prisma.Decimal; exemption: string | null; regime: string; base: Prisma.Decimal; tax: Prisma.Decimal }[]>`
      SELECT t."taxCode" AS code, t.percentage, t."exemptionCode" AS exemption, s."ivaRegime"::text AS regime,
        SUM(CASE WHEN d."documentType" = 'NC' THEN -l."netAmount" ELSE l."netAmount" END) AS base,
        SUM(CASE WHEN d."documentType" = 'NC' THEN -t.amount ELSE t.amount END) AS tax
      FROM "fiscal_document_line_taxes" t
      JOIN "fiscal_document_lines" l ON l.id = t."lineId"
      JOIN "fiscal_documents" d ON d.id = l."documentId"
      JOIN "stores" s ON s.id = d."storeId"
      WHERE d."businessId" = ${businessId} AND d.status <> 'A' AND d."documentType" IN ('FR', 'FT', 'ND', 'NC') AND t."taxType" = 'IVA'
        AND d."invoiceDate" BETWEEN ${dateValue(from)} AND ${dateValue(to)}
      GROUP BY 1, 2, 3, 4 ORDER BY 4, 2 DESC, 3`;
    const deductible = await this.prisma.$queryRaw<{ typology: string; base: Prisma.Decimal; tax: Prisma.Decimal; deductible: Prisma.Decimal }[]>`
      SELECT tl.typology, SUM(tl.base) AS base, SUM(tl."taxAmount") AS tax, SUM(tl."deductibleAmount") AS deductible
      FROM "purchase_tax_lines" tl JOIN "purchases" p ON p.id = tl."purchaseId" JOIN "stores" s ON s.id = p."storeId"
      WHERE s."businessId" = ${businessId} AND p.status <> 'CANCELLED'
        AND COALESCE(p."supplierDocDate", p."createdAt"::date) BETWEEN ${dateValue(from)} AND ${dateValue(to)}
      GROUP BY 1 ORDER BY 1`;
    const cativo = await this.prisma.$queryRaw<{ amount: Prisma.Decimal | null }[]>`
      SELECT SUM(p."withholdingAmount") AS amount FROM "purchases" p JOIN "stores" s ON s.id = p."storeId"
      WHERE s."businessId" = ${businessId} AND p.status <> 'CANCELLED' AND COALESCE(p."supplierDocDate", p."createdAt"::date) BETWEEN ${dateValue(from)} AND ${dateValue(to)}`;
    const general = charged.filter((c) => c.regime !== "SIMPLIFICADO");
    const simplified = charged.filter((c) => c.regime === "SIMPLIFICADO");
    const D = (v: Prisma.Decimal | null) => new Prisma.Decimal(v ?? 0);
    const chargedTotal = general.reduce((s, c) => s.plus(D(c.tax)), ZERO);
    const deductibleTotal = deductible.reduce((s, d) => s.plus(D(d.deductible)), ZERO);
    const turnover = simplified.reduce((s, c) => s.plus(D(c.base)).plus(D(c.tax)), ZERO);
    const simplifiedTax = turnover.times(0.07).toDecimalPlaces(2);
    const due = chargedTotal.minus(deductibleTotal).plus(simplifiedTax);
    const ivaAccounts = (await this.balances(businessId, r.year, r.fromPeriod, r.toPeriod)).filter((b) => b.code.startsWith("34.5.")).sort((a, b) => compareCodes(a.code, b.code));
    return [
      {
        title: "vatCharged",
        columns: [
          { key: "code", kind: "code" },
          { key: "rate", kind: "percent" },
          { key: "exemption", kind: "code" },
          { key: "base", kind: "money" },
          { key: "tax", kind: "money" },
        ],
        rows: general.map((c) => ({ code: c.code, rate: Number(c.percentage), exemption: c.exemption, base: money(D(c.base)), tax: money(D(c.tax)) })),
        totals: { code: null, rate: null, exemption: null, base: money(general.reduce((s, c) => s.plus(D(c.base)), ZERO)), tax: money(chargedTotal) },
      },
      {
        title: "vatDeductible",
        columns: [
          { key: "typology", kind: "code" },
          { key: "base", kind: "money" },
          { key: "tax", kind: "money" },
          { key: "deductible", kind: "money" },
        ],
        rows: deductible.map((d) => ({ typology: d.typology, base: money(D(d.base)), tax: money(D(d.tax)), deductible: money(D(d.deductible)) })),
        totals: { typology: null, base: money(deductible.reduce((s, d) => s.plus(D(d.base)), ZERO)), tax: money(deductible.reduce((s, d) => s.plus(D(d.tax)), ZERO)), deductible: money(deductibleTotal) },
      },
      {
        title: "vatSummary",
        columns: [
          { key: "line", kind: "label" },
          { key: "amount", kind: "money" },
        ],
        rows: [
          { line: "vatChargedTotal", amount: money(chargedTotal) },
          { line: "vatDeductibleTotal", amount: money(deductibleTotal) },
          { line: "simplifiedTurnover", amount: money(turnover) },
          { line: "simplifiedTax", amount: money(simplifiedTax) },
          { line: "vatCativo", amount: money(D(cativo[0]?.amount ?? null)) },
          { line: due.gte(0) ? "vatPayable" : "vatRecoverable", amount: money(due.abs()), _style: "total" },
        ],
        totals: null,
      },
      {
        title: "vatAccounts",
        columns: [
          { key: "code", kind: "code" },
          { key: "balanceDebit", kind: "money" },
          { key: "balanceCredit", kind: "money" },
        ],
        rows: ivaAccounts.map((b) => ({ code: b.code, balanceDebit: b.balance.gt(0) ? money(b.balance) : null, balanceCredit: b.balance.lt(0) ? money(b.balance.negated()) : null })),
        totals: null,
      },
    ];
  }

  // ---------------------------------------------------------------- Excel

  /** The report as an Excel workbook (one sheet per table), headed in Portuguese, amounts as numbers, dates as dates. */
  async xlsx(businessId: string, report: AccountingReport, p: ReportParams, userId?: string) {
    const result = await this.build(businessId, report, p, userId);
    const label = (k: string) => PT_LABELS[k] ?? k;
    const sheets = result.tables.map((t, i) => ({
      name: (t.title ? label(t.title) : label(report)).slice(0, 31) || `Folha ${i + 1}`,
      header: t.columns.map((c) => label(c.key)),
      rows: [...t.rows, ...(t.totals ? [{ ...t.totals, [t.columns[0].key]: "Total" }] : [])].map((row) =>
        t.columns.map((c): XlsxCell => {
          const v = row[c.key];
          if (v === null || v === undefined) return null;
          if (c.kind === "money") return Number(v);
          if (c.kind === "date") return { date: String(v) };
          if (c.kind === "label") return label(String(v));
          if (c.key === "description" && v === "openingBalance") return label("openingBalance");
          return v;
        }),
      ),
    }));
    // Different tables can share a title (statements by account): keep sheet names unique.
    const seen = new Map<string, number>();
    for (const s of sheets) {
      const n = (seen.get(s.name) ?? 0) + 1;
      seen.set(s.name, n);
      if (n > 1) s.name = `${s.name.slice(0, 27)} (${n})`;
    }
    const period = `${result.year}_P${String(result.fromPeriod).padStart(2, "0")}-P${String(result.toPeriod).padStart(2, "0")}`;
    return {
      fileName: `${label(report).replace(/[^A-Za-z0-9À-ÿ]+/g, "-")}_${period}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: buildXlsx(sheets.length ? sheets : [{ name: label(report), header: [], rows: [] }]),
    };
  }
}

/** Excel headings and statement lines, in Portuguese (the accountant's language). */
const PT_LABELS: Record<string, string> = {
  trialBalance: "Balancete",
  ledger: "Razão",
  journal: "Diário",
  statement: "Extracto de conta corrente",
  ageing: "Antiguidade de saldos",
  balanceSheet: "Balanço",
  incomeStatement: "Demonstração de Resultados",
  vat: "IVA",
  code: "Conta",
  name: "Designação",
  openingDebit: "Saldo inicial devedor",
  openingCredit: "Saldo inicial credor",
  periodDebit: "Débitos do período",
  periodCredit: "Créditos do período",
  accumulatedDebit: "Débitos acumulados",
  accumulatedCredit: "Créditos acumulados",
  balanceDebit: "Saldo devedor",
  balanceCredit: "Saldo credor",
  date: "Data",
  entry: "Lançamento",
  account: "Conta",
  description: "Descrição",
  source: "Documento",
  debit: "Débito",
  credit: "Crédito",
  balance: "Saldo",
  period: "Período",
  type: "Tipo",
  taxId: "NIF",
  d0_30: "0-30 dias",
  d31_60: "31-60 dias",
  d61_90: "61-90 dias",
  d91: "Mais de 90 dias",
  total: "Total",
  line: "Rubrica",
  amount: "Valor",
  rate: "Taxa",
  exemption: "Isenção",
  base: "Base tributável",
  tax: "IVA",
  typology: "Tipologia",
  deductible: "IVA dedutível",
  openingBalance: "Saldo transportado",
  vatCharged: "IVA liquidado",
  vatDeductible: "IVA dedutível",
  vatSummary: "Apuramento",
  vatAccounts: "Contas de IVA",
  vatChargedTotal: "IVA liquidado (regime geral)",
  vatDeductibleTotal: "IVA dedutível",
  simplifiedTurnover: "Volume de negócios (regime simplificado)",
  simplifiedTax: "IVA a 7% (regime simplificado)",
  vatCativo: "IVA cativo retido a fornecedores",
  vatPayable: "IVA a pagar",
  vatRecoverable: "IVA a recuperar",
  assets: "ACTIVO",
  nonCurrentAssets: "Activo não corrente",
  tangibleAssets: "Imobilizações corpóreas",
  intangibleAssets: "Imobilizações incorpóreas",
  financialInvestments: "Investimentos financeiros",
  totalNonCurrentAssets: "Total do activo não corrente",
  currentAssets: "Activo corrente",
  inventories: "Existências",
  tradeReceivables: "Contas a receber de clientes",
  otherReceivables: "Outros activos correntes",
  cashAndBanks: "Disponibilidades",
  totalCurrentAssets: "Total do activo corrente",
  totalAssets: "TOTAL DO ACTIVO",
  equityAndLiabilities: "CAPITAL PRÓPRIO E PASSIVO",
  equity: "Capital próprio",
  capital: "Capital",
  reserves: "Reservas",
  retainedEarnings: "Resultados transitados",
  netResult: "Resultado líquido do exercício",
  interimDividends: "Dividendos antecipados",
  totalEquity: "Total do capital próprio",
  nonCurrentLiabilities: "Passivo não corrente",
  loans: "Empréstimos",
  provisions: "Provisões para outros riscos e encargos",
  totalNonCurrentLiabilities: "Total do passivo não corrente",
  currentLiabilities: "Passivo corrente",
  tradePayables: "Contas a pagar a fornecedores",
  stateLiabilities: "Estado",
  otherPayables: "Outros passivos correntes",
  totalCurrentLiabilities: "Total do passivo corrente",
  totalEquityAndLiabilities: "TOTAL DO CAPITAL PRÓPRIO E PASSIVO",
  sales: "Vendas",
  services: "Prestações de serviço",
  otherOperatingIncome: "Outros proveitos operacionais",
  inventoryChange: "Variação nos produtos acabados e em vias de fabrico",
  ownWork: "Trabalhos para a própria empresa",
  costOfGoodsSold: "Custo das mercadorias vendidas e das matérias consumidas",
  staffCosts: "Custos com o pessoal",
  depreciation: "Amortizações",
  otherOperatingCosts: "Outros custos e perdas operacionais",
  operatingResult: "Resultados operacionais",
  financialResult: "Resultados financeiros",
  affiliatesResult: "Resultados de filiais e associadas",
  nonOperatingResult: "Resultados não operacionais",
  extraordinaryResult: "Resultados extraordinários",
  resultBeforeTax: "Resultados antes de impostos",
  incomeTax: "Imposto sobre o rendimento",
};

export function isAccountingReport(v: string): v is AccountingReport {
  return (ACCOUNTING_REPORTS as readonly string[]).includes(v);
}

