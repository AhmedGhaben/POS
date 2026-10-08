import type { StoreDto } from "@pos/shared";
import { useMoney } from "@/features/business/use-money";
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
  const money = useMoney();
  const totals = documentTotals(lines);

  return (
    <div className="mx-auto w-[300px] font-mono text-xs">
      <SlipHeader store={store} />
      <hr className="my-2 border-dashed" />
      <p className="text-center text-base font-bold tracking-widest">QUOTE</p>
      <p className="text-center">{issuedAt.toLocaleString()}</p>
      <p className="text-center">Ref {reference}</p>
      {forName && <p className="text-center">For: {forName}</p>}
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
        <span>Subtotal</span>
        <span>{money(totals.net)}</span>
      </div>
      <div className="flex justify-between">
        <span>Tax</span>
        <span>{money(totals.tax)}</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>{money(totals.gross)}</span>
      </div>
      <hr className="my-2 border-dashed" />
      <p className="text-center">Prices valid on {issuedAt.toLocaleDateString()}</p>
      <p className="mt-1 text-center font-semibold">*** NOT A RECEIPT ***</p>
      <p className="text-center">This quote is not proof of payment.</p>
    </div>
  );
}
