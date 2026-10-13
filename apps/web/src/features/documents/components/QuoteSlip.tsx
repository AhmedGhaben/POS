import type { StoreDto } from "@pos/shared";
import { useDocumentLanguage } from "@/i18n/use-document-language";
import { documentTotals, type DocumentLine } from "@/features/documents/lines";
import { SlipHeader } from "./SlipHeader";

interface QuoteSlipProps {
  store: StoreDto | undefined;
  lines: DocumentLine[];
  reference: string;
  issuedAt: Date;
  forName?: string;
}

/** 80 mm quote. Deliberately different from a receipt: no payment section, a clear disclaimer. */
export function QuoteSlip({ store, lines, reference, issuedAt, forName }: QuoteSlipProps) {
  const { t, money, qty, dateTime, date } = useDocumentLanguage();
  const totals = documentTotals(lines);

  return (
    <div className="receipt-slip mx-auto w-[300px] font-mono text-xs">
      <SlipHeader store={store} />
      <hr className="my-2 border-dashed" />
      <p className="text-center text-base font-bold tracking-widest">{t("quote.slipTitle")}</p>
      <p className="text-center">{dateTime(issuedAt)}</p>
      <p className="text-center">{t("quote.ref", { reference })}</p>
      {forName && <p className="text-center">{t("quote.for", { name: forName })}</p>}
      <hr className="my-2 border-dashed" />
      {lines.map((line) => (
        <div key={line.key}>
          <div className="flex justify-between gap-2">
            <span>
              {qty(line.quantity, line.unit)} x {line.name}
            </span>
            <span className="shrink-0">{money(line.lineGross)}</span>
          </div>
          {line.lineDiscount > 0 && (
            <div className="flex justify-between gap-2 pl-3">
              <span>{t("totals.discount")}</span>
              <span className="shrink-0">-{money(line.lineDiscount)}</span>
            </div>
          )}
        </div>
      ))}
      <hr className="my-2 border-dashed" />
      <div className="flex justify-between">
        <span>{t("totals.subtotal")}</span>
        <span>{money(totals.subtotal - (totals.discount - totals.saleDiscount))}</span>
      </div>
      {totals.saleDiscount > 0 && (
        <div className="flex justify-between">
          <span>{t("totals.saleDiscount")}</span>
          <span>-{money(totals.saleDiscount)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>{t("totals.tax")}</span>
        <span>{money(totals.tax)}</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span>{t("totals.total")}</span>
        <span>{money(totals.gross)}</span>
      </div>
      <hr className="my-2 border-dashed" />
      <p className="text-center">{t("quote.validOn", { date: date(issuedAt) })}</p>
      <p className="mt-1 text-center font-semibold">{t("quote.notReceipt")}</p>
      <p className="text-center">{t("quote.notProof")}</p>
    </div>
  );
}
