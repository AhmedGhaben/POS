import * as React from "react";
import { PaymentMethod } from "@pos/shared";
import type { SalePaymentInputDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMoney } from "@/features/business/use-money";
import { Combobox } from "@/components/ui/combobox";

interface SplitRow {
  id: number;
  method: PaymentMethod;
  amount: string;
}

interface PaymentPanelProps {
  total: number;
  onChange: (payments: SalePaymentInputDto[], isValid: boolean) => void;
}

let nextRowId = 0;

/**
 * Fast path is a single method Select (unchanged from before) plus, only for
 * CASH, a tendered-amount input with a live change-due readout. Split tender
 * is an opt-in toggle — it never appears in the default flow.
 */
export function PaymentPanel({ total, onChange }: PaymentPanelProps) {
  const { t } = useTranslation(["pos", "common"]);
  const paymentMethodOptions = Object.values(PaymentMethod).map((m) => ({ value: m, label: t(`common:paymentMethods.${m}`) }));
  const money = useMoney();
  const [isSplit, setIsSplit] = React.useState(false);
  const [method, setMethod] = React.useState<PaymentMethod>(PaymentMethod.CASH);
  const [tendered, setTendered] = React.useState("");
  const [rows, setRows] = React.useState<SplitRow[]>([]);

  const tenderedNum = tendered.trim() === "" ? null : Number(tendered);
  const changeDue =
    method === PaymentMethod.CASH && tenderedNum !== null ? tenderedNum - total : null;
  const singleInvalidTender = changeDue !== null && changeDue < 0;

  const rowsTotal = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const remaining = total - rowsTotal;
  const splitValid = Math.abs(remaining) < 0.01;

  React.useEffect(() => {
    if (isSplit) {
      const payments: SalePaymentInputDto[] = rows
        .filter((r) => Number(r.amount) > 0)
        .map((r) => ({ method: r.method, amount: Number(r.amount) }));
      onChange(payments, splitValid && payments.length > 0);
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
    setRows([
      { id: nextRowId++, method: PaymentMethod.CASH, amount: total.toFixed(2) },
      { id: nextRowId++, method: PaymentMethod.CARD, amount: "0.00" },
    ]);
    setIsSplit(true);
  }

  function disableSplit() {
    setIsSplit(false);
    setRows([]);
  }

  function updateRow(id: number, patch: Partial<SplitRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { id: nextRowId++, method: PaymentMethod.CARD, amount: "0.00" }]);
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
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
        <Button variant="outline" size="sm" className="w-full" onClick={addRow}>
          {t("payment.addMethod")}
        </Button>
        <p className={`text-sm ${splitValid ? "text-muted-foreground" : "text-destructive"}`}>
          {splitValid ? t("payment.fullyAllocated") : t("payment.remaining", { amount: money(remaining) })}
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
