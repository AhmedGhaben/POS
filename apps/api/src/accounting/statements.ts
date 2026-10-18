import { Prisma } from "@prisma/client";

/**
 * The PGC financial statements (Decreto 82/01): which accounts make each
 * line of the Balanço and the Demonstração de Resultados por natureza.
 * Pure, so the layout can be tested and read on its own.
 */

type Money = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);

/** A movement account's balance: debit − credit. */
export interface AccountBalance {
  code: string;
  balance: Money;
}

const firstDegree = (code: string) => code.split(".")[0];
const inRange = (code: string, from: number, to: number) => {
  const n = Number(firstDegree(code));
  return n >= from && n <= to;
};

export interface StatementLine {
  key: string;
  /** Section heading, a line, a subtotal or a total. */
  kind: "section" | "line" | "subtotal" | "total";
  amount: Money | null;
}

/** Balance sheet lines; assets as debit balances, equity and liabilities as credit balances. */
export function balanceSheet(balances: AccountBalance[]): { lines: StatementLine[]; totalAssets: Money; totalEquityAndLiabilities: Money } {
  const sum = (match: (code: string, b: Money) => boolean, sign: 1 | -1) =>
    balances.filter((b) => match(b.code, b.balance)).reduce((s, b) => s.plus(b.balance.times(sign)), ZERO);
  const debitBalance = (b: Money) => b.gt(0);
  const creditBalance = (b: Money) => b.lt(0);
  const third = (c: string) => inRange(c, 31, 37);
  const is = (prefixes: string[]) => (c: string) => prefixes.includes(firstDegree(c));

  // Non-current assets.
  const tangible = sum((c) => is(["11", "14"])(c) || c === "18.1" || c.startsWith("18.1."), 1);
  const intangible = sum((c) => is(["12"])(c) || c === "18.2" || c.startsWith("18.2."), 1);
  const financial = sum(is(["13", "19"]), 1);
  const nonCurrent = tangible.plus(intangible).plus(financial);
  // Current assets.
  const inventories = sum((c) => inRange(c, 21, 29), 1);
  const receivables = sum((c, b) => (is(["31"])(c) && debitBalance(b)) || is(["38"])(c), 1);
  const otherReceivables = sum((c, b) => third(c) && !is(["31"])(c) && debitBalance(b), 1);
  const cash = sum((c) => inRange(c, 41, 49), 1);
  const current = inventories.plus(receivables).plus(otherReceivables).plus(cash);
  const totalAssets = nonCurrent.plus(current);

  // Equity: the year's result is what classes 6, 7 and 82-88 add up to (before or after the apuramento).
  const capital = sum(is(["51", "52"]), -1);
  const reserves = sum((c) => inRange(c, 53, 58), -1);
  const retained = sum(is(["81"]), -1);
  const result = sum((c) => inRange(c, 61, 79) || inRange(c, 82, 88), -1);
  const dividends = sum(is(["89"]), -1);
  const equity = capital.plus(reserves).plus(retained).plus(result).plus(dividends);
  // Liabilities.
  const loans = sum(is(["33"]), -1);
  const provisions = sum(is(["39"]), -1);
  const nonCurrentLiabilities = loans.plus(provisions);
  const suppliers = sum((c, b) => is(["32"])(c) && creditBalance(b), -1);
  const state = sum((c, b) => is(["34"])(c) && creditBalance(b), -1);
  const otherPayables = sum((c, b) => third(c) && !is(["32", "34"])(c) && creditBalance(b), -1);
  const currentLiabilities = suppliers.plus(state).plus(otherPayables);
  const totalEquityAndLiabilities = equity.plus(nonCurrentLiabilities).plus(currentLiabilities);

  const L = (key: string, amount: Money | null, kind: StatementLine["kind"] = "line"): StatementLine => ({ key, kind, amount });
  return {
    totalAssets,
    totalEquityAndLiabilities,
    lines: [
      L("assets", null, "section"),
      L("nonCurrentAssets", null, "section"),
      L("tangibleAssets", tangible),
      L("intangibleAssets", intangible),
      L("financialInvestments", financial),
      L("totalNonCurrentAssets", nonCurrent, "subtotal"),
      L("currentAssets", null, "section"),
      L("inventories", inventories),
      L("tradeReceivables", receivables),
      L("otherReceivables", otherReceivables),
      L("cashAndBanks", cash),
      L("totalCurrentAssets", current, "subtotal"),
      L("totalAssets", totalAssets, "total"),
      L("equityAndLiabilities", null, "section"),
      L("equity", null, "section"),
      L("capital", capital),
      L("reserves", reserves),
      L("retainedEarnings", retained),
      L("netResult", result),
      L("interimDividends", dividends),
      L("totalEquity", equity, "subtotal"),
      L("nonCurrentLiabilities", null, "section"),
      L("loans", loans),
      L("provisions", provisions),
      L("totalNonCurrentLiabilities", nonCurrentLiabilities, "subtotal"),
      L("currentLiabilities", null, "section"),
      L("tradePayables", suppliers),
      L("stateLiabilities", state),
      L("otherPayables", otherPayables),
      L("totalCurrentLiabilities", currentLiabilities, "subtotal"),
      L("totalEquityAndLiabilities", totalEquityAndLiabilities, "total"),
    ],
  };
}

/**
 * Demonstração de resultados por natureza over a range of periods, from
 * the balances of classes 6 and 7 (and 87) without the apuramento entries.
 */
export function incomeStatement(balances: AccountBalance[]): { lines: StatementLine[]; netResult: Money } {
  // Income as a positive amount (credit balance), costs as a negative one.
  const of = (prefix: string) => balances.filter((b) => firstDegree(b.code) === prefix).reduce((s, b) => s.minus(b.balance), ZERO);
  const sales = of("61");
  const services = of("62");
  const otherOperating = of("63");
  const inventoryChange = of("64");
  const ownWork = of("65");
  const cogs = of("71");
  const staff = of("72");
  const depreciation = of("73");
  const otherCosts = of("74").plus(of("75"));
  const operating = [sales, services, otherOperating, inventoryChange, ownWork, cogs, staff, depreciation, otherCosts].reduce((s, v) => s.plus(v), ZERO);
  const financial = of("66").plus(of("76"));
  const affiliates = of("67").plus(of("77"));
  const nonOperating = of("68").plus(of("78"));
  const extraordinary = of("69").plus(of("79"));
  const beforeTax = operating.plus(financial).plus(affiliates).plus(nonOperating).plus(extraordinary);
  const tax = of("87");
  const netResult = beforeTax.plus(tax);
  const L = (key: string, amount: Money, kind: StatementLine["kind"] = "line"): StatementLine => ({ key, kind, amount });
  return {
    netResult,
    lines: [
      L("sales", sales),
      L("services", services),
      L("otherOperatingIncome", otherOperating),
      L("inventoryChange", inventoryChange),
      L("ownWork", ownWork),
      L("costOfGoodsSold", cogs),
      L("staffCosts", staff),
      L("depreciation", depreciation),
      L("otherOperatingCosts", otherCosts),
      L("operatingResult", operating, "subtotal"),
      L("financialResult", financial),
      L("affiliatesResult", affiliates),
      L("nonOperatingResult", nonOperating),
      L("extraordinaryResult", extraordinary),
      L("resultBeforeTax", beforeTax, "subtotal"),
      L("incomeTax", tax),
      L("netResult", netResult, "total"),
    ],
  };
}

/** Age buckets of open documents, by days since their date. */
export const AGE_BUCKETS = [
  { key: "d0_30", max: 30 },
  { key: "d31_60", max: 60 },
  { key: "d61_90", max: 90 },
  { key: "d91", max: Infinity },
] as const;

export function ageBucket(documentDate: string, today: string): (typeof AGE_BUCKETS)[number]["key"] {
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${documentDate}T00:00:00Z`)) / 86_400_000);
  return AGE_BUCKETS.find((b) => days <= b.max)!.key;
}
