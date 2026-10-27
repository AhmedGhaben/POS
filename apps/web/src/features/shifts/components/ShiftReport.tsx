import { useTranslation } from "react-i18next";
import type { PaymentMethod, ShiftProductRowDto, ShiftSummaryDto, StoreDto } from "@pos/shared";
import { SlipHeader } from "@/features/documents/components/SlipHeader";
import { useDocumentLanguage } from "@/i18n/use-document-language";

/** What the report shows, from the server's shift or the till's own record. */
export interface ShiftReportData {
  terminal?: { name: string; code: string } | null;
  openedBy: string;
  openedAt: string;
  closedBy?: string | null;
  closedAt?: string | null;
  openingFloat: number;
  countedCash?: number | null;
  expectedCash: number;
  /** The till's own figure, when it differs from the server's. */
  tillExpectedCash?: number | null;
  note?: string | null;
  summary: ShiftSummaryDto;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="shrink-0">{value}</span>
    </div>
  );
}

/** Products with quantity and total, then the amount without IVA and the IVA; with totals. */
function ProductList({ title, rows, storeId }: { title: string; rows: ShiftProductRowDto[]; storeId: string | undefined }) {
  const { money, qty, lang } = useDocumentLanguage(undefined, storeId);
  const { t } = useTranslation(["shifts"], { lng: lang });
  const sum = (key: "net" | "tax" | "total") => rows.reduce((total, r) => total + Number(r[key]), 0);
  return (
    <>
      <hr className="my-2 border-dashed" />
      <p className="font-semibold">{title}</p>
      {rows.map((r) => (
        <div key={r.productId}>
          <Row label={`${qty(r.quantity, r.unit)} ${r.name}`} value={money(r.total)} />
          <p className="pl-2 text-[10px]">{t("report.netAndTax", { net: money(r.net), tax: money(r.tax) })}</p>
        </div>
      ))}
      <Row label={t("report.productsNet")} value={money(sum("net"))} />
      <Row label={t("report.productsTax")} value={money(sum("tax"))} />
      <Row label={t("report.productsTotal")} value={money(sum("total"))} strong />
    </>
  );
}

/**
 * The end-of-shift report, 80 mm. A printed document like the others: in
 * the store's document language (pt-AO in Angola), whatever the cashier's
 * screens are in.
 */
export function ShiftReport({
  data,
  store,
  withSales = false,
}: {
  data: ShiftReportData;
  store: StoreDto | undefined;
  /** Also list every sale (receipt, time, method, total). */
  withSales?: boolean;
}) {
  const { money, dateTime, lang } = useDocumentLanguage(undefined, store?.id);
  const { t } = useTranslation(["shifts", "common"], { lng: lang });
  const s = data.summary;
  const difference = data.countedCash != null ? data.countedCash - data.expectedCash : null;

  return (
    <div className="receipt-slip mx-auto w-[300px] font-mono text-xs">
      <SlipHeader store={store} />
      <hr className="my-2 border-dashed" />
      <p className="text-center text-sm font-bold">{data.closedAt ? t("report.title") : t("report.titleOpen")}</p>
      {data.terminal && <p className="text-center">{`${data.terminal.code} ${data.terminal.name}`}</p>}
      <Row label={t("report.opened")} value={dateTime(data.openedAt)} />
      <Row label="" value={data.openedBy} />
      {data.closedAt && (
        <>
          <Row label={t("report.closed")} value={dateTime(data.closedAt)} />
          {data.closedBy && <Row label="" value={data.closedBy} />}
        </>
      )}
      <hr className="my-2 border-dashed" />
      <Row label={t("report.sales", { count: s.salesCount })} value={money(s.salesTotal)} strong />
      {(Object.entries(s.byMethod) as [PaymentMethod, string][]).map(([method, amount]) => (
        <Row key={method} label={`  ${t(`common:paymentMethods.${method}`)}`} value={money(amount)} />
      ))}
      {Number(s.discounts) > 0 && <Row label={t("report.discounts")} value={money(s.discounts)} />}
      {s.voided.count > 0 && <Row label={t("report.voided", { count: s.voided.count })} value={money(s.voided.total)} />}
      {s.returns.count > 0 && <Row label={t("report.returns", { count: s.returns.count })} value={money(s.returns.total)} />}
      {Number(s.onCredit ?? 0) > 0 && <Row label={t("report.onCredit")} value={money(s.onCredit!)} />}
      {s.receipts && s.receipts.count > 0 && (
        <>
          <Row label={t("report.receipts", { count: s.receipts.count })} value={money(s.receipts.total)} />
          {(Object.entries(s.receipts.byMethod) as [PaymentMethod, string][]).map(([method, amount]) => (
            <Row key={method} label={`  ${t(`common:paymentMethods.${method}`)}`} value={money(amount)} />
          ))}
        </>
      )}
      <hr className="my-2 border-dashed" />
      <Row label={t("report.float")} value={money(data.openingFloat)} />
      <Row label={t("report.cashSales")} value={money(s.byMethod.CASH ?? 0)} />
      {Number(s.receipts?.byMethod.CASH ?? 0) > 0 && <Row label={t("report.cashReceipts")} value={money(s.receipts!.byMethod.CASH!)} />}
      {Number(s.returns.cash) > 0 && <Row label={t("report.cashRefunds")} value={`-${money(s.returns.cash)}`} />}
      {s.movements.map((m) => (
        <Row
          key={m.id}
          label={`${m.type === "IN" ? t("report.cashIn") : t("report.cashOut")}: ${t(`reasons.${m.reason}`)}`}
          value={`${m.type === "IN" ? "" : "-"}${money(m.amount)}`}
        />
      ))}
      <Row label={t("report.expected")} value={money(data.expectedCash)} strong />
      {data.tillExpectedCash != null && Math.abs(data.tillExpectedCash - data.expectedCash) >= 0.005 && (
        <Row label={t("report.tillExpected")} value={money(data.tillExpectedCash)} />
      )}
      {data.countedCash != null && (
        <>
          <Row label={t("report.counted")} value={money(data.countedCash)} strong />
          <Row
            label={t("report.difference")}
            value={`${difference! > 0 ? "+" : ""}${money(difference!)}`}
            strong
          />
        </>
      )}
      {data.note && <p className="mt-1 whitespace-pre-line">{data.note}</p>}
      {s.byCashier.length > 0 && (
        <>
          <hr className="my-2 border-dashed" />
          <p className="font-semibold">{t("report.byCashier")}</p>
          {s.byCashier.map((c) => (
            <Row key={c.id} label={`${c.name} (${c.count})`} value={money(c.total)} />
          ))}
        </>
      )}
      {s.products && s.products.length > 0 && <ProductList title={t("report.productsSold")} rows={s.products} storeId={store?.id} />}
      {s.returnedProducts && s.returnedProducts.length > 0 && (
        <ProductList title={t("report.productsReturned")} rows={s.returnedProducts} storeId={store?.id} />
      )}
      {withSales && s.sales && s.sales.length > 0 && (
        <>
          <hr className="my-2 border-dashed" />
          <p className="font-semibold">{t("report.allSales")}</p>
          {s.sales.map((sale) => (
            <div key={sale.receiptNumber} className={sale.voided ? "line-through" : undefined}>
              <Row label={sale.documentNo ?? sale.receiptNumber} value={money(sale.total)} />
              <p className="pl-2 text-[10px]">
                {sale.documentNo ? `${sale.receiptNumber} · ` : ""}
                {dateTime(sale.at)} · {sale.method === "SPLIT" ? t("report.split") : sale.method === "CREDIT" ? t("report.credit") : t(`common:paymentMethods.${sale.method}`)}
                {sale.voided ? ` · ${t("report.cancelled")}` : ""}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
