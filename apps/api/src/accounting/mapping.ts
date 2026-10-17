/**
 * The integration's account mapping (docs/ACCOUNTING-DECISIONS.md, step A4):
 * every account the automatic postings use has a key; a business can point
 * any key at another account. Without that, the default below is used.
 *
 * "@till" is the till's own cash account (or Caixa principal when cash
 * isn't kept per till, or the sale was made in a browser); "@bank" the
 * first bank account in Settings, or 43.1.1.
 */

export const RATE_KEYS = ["14", "5", "7", "1"] as const;
export const PAYMENT_METHODS = ["CASH", "CARD", "CREDIT_CARD", "MULTICAIXA_REFERENCE", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "OTHER"] as const;
export const EXPENSE_CATEGORIES = ["RENT", "UTILITIES", "SUPPLIES", "PAYROLL", "MARKETING", "MAINTENANCE", "OTHER"] as const;
export const DEDUCTIBLE_TYPES = ["INV", "MFI", "OBC", "SERV", "IMPT", "SCE"] as const;

const salesRate = (base: string): Record<string, string> => ({ "14": `${base}.1`, "5": `${base}.2`, "7": `${base}.3`, "1": `${base}.4`, exempt: `${base}.5`, other: `${base}.9` });
const goods = salesRate("61.3");
const services = salesRate("62.1");
const liquidado: Record<string, string> = { "14": "34.5.3.1", "5": "34.5.3.2", "7": "34.5.3.3", "1": "34.5.3.4", other: "34.5.3.9" };

export interface MappingKey {
  key: string;
  /** For the settings screen. */
  group: "sales" | "iva" | "payments" | "stock" | "cash" | "expenses";
  defaultCode: string;
}

export const MAPPING_KEYS: MappingKey[] = [
  ...[...RATE_KEYS, "exempt", "other"].map((r) => ({ key: `sales.goods.${r}`, group: "sales" as const, defaultCode: goods[r] })),
  ...[...RATE_KEYS, "exempt", "other"].map((r) => ({ key: `sales.services.${r}`, group: "sales" as const, defaultCode: services[r] })),
  { key: "sales.discounts.goods", group: "sales", defaultCode: "61.8.1" },
  { key: "sales.discounts.services", group: "sales", defaultCode: "62.8.1" },
  { key: "sales.returns", group: "sales", defaultCode: "61.7.1" },
  ...[...RATE_KEYS, "other"].map((r) => ({ key: `iva.liquidado.${r}`, group: "iva" as const, defaultCode: liquidado[r] })),
  // Credit notes lower the IVA charged at the same rate (point these at 34.5.4.1 to keep them apart).
  ...[...RATE_KEYS, "other"].map((r) => ({ key: `iva.nc.${r}`, group: "iva" as const, defaultCode: liquidado[r] })),
  ...DEDUCTIBLE_TYPES.map((t, i) => ({ key: `iva.dedutivel.${t}`, group: "iva" as const, defaultCode: `34.5.2.${i + 1}` })),
  { key: "iva.naoDedutivel", group: "iva", defaultCode: "75.3.1" },
  { key: "iva.cativo", group: "iva", defaultCode: "34.5.6.2" },
  ...PAYMENT_METHODS.map((m) => ({ key: `payment.${m}`, group: "payments" as const, defaultCode: m === "CASH" ? "@till" : m === "OTHER" ? "45.1.1" : "@bank" })),
  { key: "cash.main", group: "payments", defaultCode: "45.1.1" },
  { key: "stock", group: "stock", defaultCode: "26.1" },
  { key: "cogs", group: "stock", defaultCode: "71.2" },
  { key: "purchases.nonStock", group: "stock", defaultCode: "75.2.9" },
  { key: "stock.gain", group: "stock", defaultCode: "68.3.1" },
  { key: "stock.loss", group: "stock", defaultCode: "78.3.1" },
  { key: "cash.over", group: "cash", defaultCode: "68.8.1" },
  { key: "cash.short", group: "cash", defaultCode: "78.8.1" },
  { key: "rounding.gain", group: "cash", defaultCode: "68.8.9" },
  { key: "rounding.loss", group: "cash", defaultCode: "78.8.9" },
  ...EXPENSE_CATEGORIES.map((c) => ({
    key: `expense.${c}`,
    group: "expenses" as const,
    defaultCode: { RENT: "75.2.1", UTILITIES: "75.2.2", SUPPLIES: "75.2.3", PAYROLL: "72.2", MARKETING: "75.2.4", MAINTENANCE: "75.2.5", OTHER: "75.2.9" }[c],
  })),
  { key: "expense.paidFrom", group: "expenses", defaultCode: "45.1.1" },
];

const BY_KEY = new Map(MAPPING_KEYS.map((k) => [k.key, k]));

/** A tax percentage as a key part: 14.00 → "14", 0 → "exempt". */
export function rateKey(percentage: string | number): string {
  const n = Number(percentage);
  if (!n) return "exempt";
  return String(Number(n.toFixed(2)));
}

/**
 * The keys to try, most specific first: a rate the list doesn't know falls
 * back to "other"; an exemption code (M10) to "exempt".
 */
export function keyChain(key: string): string[] {
  const chain = [key];
  const exempt = /^(sales\.(?:goods|services))\.exempt\.\w+$/.exec(key);
  if (exempt) chain.push(`${exempt[1]}.exempt`);
  const rate = /^((?:sales\.(?:goods|services))|(?:iva\.(?:liquidado|nc)))\.([\d.]+)$/.exec(key);
  if (rate && !BY_KEY.has(key)) chain.push(`${rate[1]}.other`);
  return chain;
}

/** The default account code for a key (following its chain), or null when there is none. */
export function defaultCodeFor(key: string): string | null {
  for (const k of keyChain(key)) {
    const d = BY_KEY.get(k);
    if (d) return d.defaultCode;
  }
  return null;
}

export function isMappingKey(key: string): boolean {
  return BY_KEY.has(key) || /^sales\.(goods|services)\.exempt\.M\d{2}$/.test(key);
}
