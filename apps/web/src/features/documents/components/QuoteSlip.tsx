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
  const { t, money, dateTime, date } = useDocumentLanguage();
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
        <div key={line.key} className="flex justify-between gap-2">
          <span>
            {line.quantity} x {line.name}
          </span>
          <span className="shrink-0">{money(line.gross)}</span>
        </div>
      ))}
      <hr className="my-2 border-dashed" />
      <div className="flex justify-between">
        <span>{t("totals.subtotal")}</span>
        <span>{money(totals.net)}</span>
      </div>
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
