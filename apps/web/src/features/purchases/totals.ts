/**
 * A purchase's totals as the form shows them (the server works them out the
 * same way, apps/api/src/purchases/purchase-taxes.ts): net from the lines,
 * IVA rounded to the cent, IVA cativo withheld for the State, what's owed
 * to the supplier.
 */
export function purchaseTotals(lines: { quantity: unknown; unitCost: unknown }[], taxRate: number, withholding: number) {
  const cents = (n: number) => Math.round(n * 100);
  const net = lines.reduce((s, l) => s + cents((Number(l.quantity) || 0) * (Number(l.unitCost) || 0)), 0);
  const tax = Math.round((net * taxRate) / 100);
  const withheld = Math.round((tax * withholding) / 100);
  return { net: net / 100, tax: tax / 100, total: (net + tax) / 100, withheld: withheld / 100, payable: (net + tax - withheld) / 100 };
}
