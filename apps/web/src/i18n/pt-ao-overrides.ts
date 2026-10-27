/**
 * Where Angola says it differently, not just spells it differently (pt-AO
 * is otherwise pt-PT in Angolan spelling, see ao-spelling.ts). Same shape
 * as the locale files: namespace → nested keys.
 */
export const PT_AO_OVERRIDES: Record<string, Record<string, unknown>> = {
  common: {
    paymentMethods: {
      CASH: "Numerário",
      CARD: "Multicaixa / TPA",
      MOBILE_MONEY: "Multicaixa Express / Unitel Money",
    },
  },
  shifts: {
    report: {
      notInDrawer: "Pagamentos que não estão na gaveta (Multicaixa/TPA, transferência…)",
    },
  },
  // The words Angolan invoices use for the totals.
  documents: {
    fiscal: {
      netTotal: "Total Ilíquido",
      taxTotal: "Total Imposto",
    },
  },
};

/** Deep-merges the overrides into a language's resources. */
export function withOverrides(
  resources: Record<string, Record<string, unknown>>,
  overrides: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const merge = (base: Record<string, unknown>, extra: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(extra)) {
      out[k] = v && typeof v === "object" && !Array.isArray(v) ? merge((base[k] as Record<string, unknown>) ?? {}, v as Record<string, unknown>) : v;
    }
    return out;
  };
  const out: Record<string, Record<string, unknown>> = { ...resources };
  for (const [ns, extra] of Object.entries(overrides)) out[ns] = merge(resources[ns] ?? {}, extra);
  return out;
}
