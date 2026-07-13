import * as React from "react";
import { PaymentMethod } from "@pos/shared";
import type { SalePaymentInputDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: "Cash",
  [PaymentMethod.CARD]: "Card",
  [PaymentMethod.MOBILE_MONEY]: "Mobile money",
  [PaymentMethod.OTHER]: "Other",
};

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
            <Select
              value={row.method}
              onValueChange={(v) => updateRow(row.id, { method: v as PaymentMethod })}
            >
              <SelectTrigger className="w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(PaymentMethod).map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              aria-label="Remove payment"
              onClick={() => removeRow(row.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-full" onClick={addRow}>
          Add payment method
        </Button>
        <p className={`text-sm ${splitValid ? "text-muted-foreground" : "text-destructive"}`}>
          {splitValid ? "Fully allocated" : `Remaining: $${remaining.toFixed(2)}`}
        </p>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          onClick={disableSplit}
        >
          Cancel split payment
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.values(PaymentMethod).map((m) => (
            <SelectItem key={m} value={m}>
              {PAYMENT_LABELS[m]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {method === PaymentMethod.CASH && (
        <div className="space-y-1">
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Tendered amount (optional)"
            value={tendered}
            onChange={(e) => setTendered(e.target.value)}
          />
          {changeDue !== null && (
            <p
              className={`text-sm ${singleInvalidTender ? "text-destructive" : "text-muted-foreground"}`}
            >
              {singleInvalidTender
                ? "Tendered amount is less than the total"
                : `Change due: $${changeDue.toFixed(2)}`}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        onClick={enableSplit}
      >
        + Split payment
      </button>
    </div>
  );
}
