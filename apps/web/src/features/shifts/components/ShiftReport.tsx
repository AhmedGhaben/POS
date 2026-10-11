import { useTranslation } from "react-i18next";
import type { PaymentMethod, ShiftSummaryDto, StoreDto } from "@pos/shared";
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

/**
 * The end-of-shift report, 80 mm. It's for the shop, not the customer, so
 * it uses the cashier's screen language.
 */
export function ShiftReport({ data, store }: { data: ShiftReportData; store: StoreDto | undefined }) {
  const { t } = useTranslation(["shifts", "common"]);
  const { money, dateTime } = useDocumentLanguage();
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
      <hr className="my-2 border-dashed" />
      <Row label={t("report.float")} value={money(data.openingFloat)} />
      <Row label={t("report.cashSales")} value={money(s.byMethod.CASH ?? 0)} />
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
    </div>
  );
}
