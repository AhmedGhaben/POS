import * as React from "react";
import { PAYMENT_METHOD_ORDER, PaymentMethod } from "@pos/shared";
import type { SalePaymentInputDto } from "@pos/shared";
import type { PaymentDraft } from "@/features/pos/cart-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMoney } from "@/features/business/use-money";
import { Combobox } from "@/components/ui/combobox";
import { splitEvenly, splitPayments } from "@/features/pos/split-payment";

type SplitRow = PaymentDraft["rows"][number];

interface PaymentPanelProps {
  total: number;
  onChange: (payments: SalePaymentInputDto[], isValid: boolean) => void;
  /** What was set so far (kept with the cart); null starts afresh. */
  draft?: PaymentDraft | null;
  onDraftChange?: (draft: PaymentDraft) => void;
}

let nextRowId = 0;
/** Unique across restarts too: rows are kept with the cart. */
const newRowId = () => Date.now() * 100 + (nextRowId++ % 100);

const START: PaymentDraft = { isSplit: false, method: PaymentMethod.CASH, tendered: "", rows: [] };

/**
 * Fast path is a single method Select (unchanged from before) plus, only for
 * CASH, a tendered-amount input with a live change-due readout. Split tender
 * is an opt-in toggle — it never appears in the default flow.
 */
export function PaymentPanel({ total, onChange, draft, onDraftChange }: PaymentPanelProps) {
  const { t } = useTranslation(["pos", "common"]);
  const paymentMethodOptions = PAYMENT_METHOD_ORDER.map((m) => ({ value: m, label: t(`common:paymentMethods.${m}`) }));
  const money = useMoney();
  // Controlled by the cart when it gives a draft, so a typed amount survives leaving the page.
  const [own, setOwn] = React.useState<PaymentDraft>(draft ?? START);
  const state = draft ?? own;
  const { isSplit, method, tendered, rows } = state;
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const patch = React.useCallback(
    (change: Partial<PaymentDraft> | ((prev: PaymentDraft) => Partial<PaymentDraft>)) => {
      const prev = stateRef.current;
      const next = { ...prev, ...(typeof change === "function" ? change(prev) : change) };
      stateRef.current = next;
      setOwn(next);
      onDraftChange?.(next);
    },
    [onDraftChange],
  );
  const setMethod = (v: PaymentMethod) => patch({ method: v });
  const setTendered = (v: string) => patch({ tendered: v });
  const setRows = (change: SplitRow[] | ((prev: SplitRow[]) => SplitRow[])) =>
    patch((prev) => ({ rows: typeof change === "function" ? change(prev.rows) : change }));

  const tenderedNum = tendered.trim() === "" ? null : Number(tendered);
  const changeDue =
    method === PaymentMethod.CASH && tenderedNum !== null ? tenderedNum - total : null;
  const singleInvalidTender = changeDue !== null && changeDue < 0;

  // Only cash can be overpaid: cash above what's due is tendered, and gives change.
  const split = splitPayments(rows, total);
  const [payers, setPayers] = React.useState(2);

  React.useEffect(() => {
    if (isSplit) {
      onChange(split.payments, split.status === "ok" && split.payments.length > 0);
    } else {
      const payments: SalePaymentInputDto[] = [
        {
          method,
          amount: total,
          tendered:
            method === PaymentMethod.CASH && tenderedNum !== null ? tenderedNum : undefined,
        },
      ];
      onChange(payments, !singleInvalidTender);
    }
    // Recompute whenever any input affecting the derived `payments` array changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSplit, method, tenderedNum, rows, total]);

  function enableSplit() {
    patch({
      isSplit: true,
      rows: [
        { id: newRowId(), method: PaymentMethod.CASH, amount: total.toFixed(2) },
        { id: newRowId(), method: PaymentMethod.CARD, amount: "0.00" },
      ],
    });
  }

  function disableSplit() {
    patch({ isSplit: false, rows: [] });
  }

  function updateRow(id: number, patch: Partial<SplitRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { id: newRowId(), method: PaymentMethod.CARD, amount: "0.00" }]);
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function shareEvenly() {
    setRows((prev) => splitEvenly(prev, total, payers, newRowId));
  }

  if (isSplit) {
    return (
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <Combobox
              value={row.method}
              onChange={(v) => v !== null && updateRow(row.id, { method: v as PaymentMethod })}
              className="w-32 shrink-0"
              aria-label={t("payment.method")}
              options={paymentMethodOptions}
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              value={row.amount}
              onChange={(e) => updateRow(row.id, { amount: e.target.value })}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("payment.removePayment")}
              onClick={() => removeRow(row.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={addRow}>
            {t("payment.addMethod")}
          </Button>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            aria-label={t("payment.payers")}
            value={payers}
            onChange={(e) => setPayers(Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {t("payment.payersCount", { count: n })}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={shareEvenly}>
            {t("payment.splitEvenly")}
          </Button>
        </div>
        <p className={`text-sm ${split.status === "ok" ? "text-muted-foreground" : "text-destructive"}`}>
          {split.status === "nonCashOver"
            ? t("payment.nonCashOver")
            : split.status === "short"
              ? t("payment.remaining", { amount: money(split.remaining) })
              : split.changeDue > 0
                ? t("payment.changeDue", { amount: money(split.changeDue) })
                : t("payment.fullyAllocated")}
        </p>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          onClick={disableSplit}
        >
          {t("payment.cancelSplit")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Combobox
        value={method}
        onChange={(v) => v !== null && setMethod(v as PaymentMethod)}
        aria-label={t("payment.method")}
        options={paymentMethodOptions}
      />

      {method === PaymentMethod.CASH && (
        <div className="space-y-1">
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder={t("payment.tendered")}
            value={tendered}
            onChange={(e) => setTendered(e.target.value)}
          />
          {changeDue !== null && (
            <p
              className={`text-sm ${singleInvalidTender ? "text-destructive" : "text-muted-foreground"}`}
            >
              {singleInvalidTender
                ? t("payment.tenderedTooLow")
                : t("payment.changeDue", { amount: money(changeDue) })}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        onClick={enableSplit}
      >
        {t("payment.split")}
      </button>
    </div>
  );
}
