import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BusinessDto, ShiftDto, ShiftSummaryDto, StoreDto } from "@pos/shared";
import { PaymentMethod } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import i18n from "@/i18n";
import { reportFromServer } from "../report-data";
import { ShiftReport } from "./ShiftReport";
import { formatDateTime } from "@/lib/format";

const store = { id: "s1", country: "AO", timezone: "Africa/Luanda", name: "Test shop" } as StoreDto;
const summary: ShiftSummaryDto = {
  salesCount: 2, salesTotal: "30", byMethod: { CASH: "10", CARD: "20" }, discounts: "0",
  voided: { count: 1, total: "5" }, returns: { count: 0, total: "0", cash: "0" },
  cashIn: "0", cashOut: "0", movements: [], byCashier: [], expectedCash: "110",
  products: [{ productId: "tea", name: "Count tea", sku: "TEA", unit: "un", quantity: "3", net: "30", tax: "0", total: "30" }],
  sales: [
    { receiptNumber: "MAIN-1", documentNo: "FR POS001-2026/10", at: "2026-10-29T09:15:00Z", total: "10", method: PaymentMethod.CASH, voided: false, cashier: "Ana" },
    { receiptNumber: "MAIN-2", documentNo: "FR POS001-2026/11", at: "2026-10-29T09:20:00Z", total: "20", method: PaymentMethod.CARD, voided: false, cashier: "Ana" },
    { receiptNumber: "MAIN-3", documentNo: "FR POS001-2026/12", at: "2026-10-29T09:25:00Z", total: "5", method: "SPLIT", voided: true, cashier: "Ana" },
  ],
};
const shift = {
  openedBy: { firstName: "Ana", lastName: "Owner" }, closedBy: { firstName: "Ana", lastName: "Owner" },
  openedAt: "2026-10-29T08:00:00Z", closedAt: "2026-10-29T17:00:00Z", openingFloat: "100", countedCash: "112",
  expectedCash: "110", note: "Count note", summary,
} as ShiftDto;

describe("full shift report", () => {
  beforeAll(async () => {
    const state = { stores: [store], currentStoreId: store.id, business: { currency: "AOA", country: "AO", language: "pt-PT" } as BusinessDto };
    useAuthStore.setState(state);
    Object.assign(useAuthStore.getInitialState(), state);
    await i18n.changeLanguage("pt-PT");
  });
  it("preserves the server summary and prints the complete sales and product breakdown with cash reconciliation", () => {
    const data = reportFromServer(shift);
    expect(data.summary).toBe(summary);
    const html = renderToStaticMarkup(<ShiftReport data={data} store={store} withSales />).replace(/\u00a0|&nbsp;/g, " ");
    for (const text of ["FR POS001-2026/10", "FR POS001-2026/11", "FR POS001-2026/12", formatDateTime(summary.sales![0].at), "Count tea", "Ana Owner", "Count note", "Multicaixa", "112,00", "110,00", "Sobra 2,00"]) expect(html).toContain(text);
    expect(html).toContain("line-through");
    expect(html).not.toContain("MAIN-");
  });
  it("can still print the cashier's optional summary without the sales list", () => {
    const html = renderToStaticMarkup(<ShiftReport data={reportFromServer(shift)} store={store} />);
    expect(html).not.toContain("FR POS001-2026/10");
    expect(html).toContain("Count tea");
  });
  it("keeps the internal reference as fallback only when a historical sale has no fiscal number", () => {
    const data = reportFromServer(shift);
    const html = renderToStaticMarkup(<ShiftReport data={{ ...data, summary: { ...summary, sales: [{ ...summary.sales![0], documentNo: null }] } }} store={store} withSales />);
    expect(html).toContain("MAIN-1");
  });
});
