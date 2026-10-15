import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PAYMENT_METHOD_ORDER, PaymentMethod, type CustomerPaymentDto } from "@pos/shared";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";
import { useCurrentShift, useShiftStore } from "@/features/shifts/shift-store";
import { ApiError } from "@/lib/api-client";
import { receivePayment } from "../api";

/**
 * A customer pays towards their account: a receipt (Recibo, RC), set
 * against their oldest invoices. Cash goes into the drawer of the person's
 * open shift here; without one only other methods (transfer, card...) are
 * offered, and cashiers need their shift for any.
 */
export function ReceivePaymentDialog({
  customer,
  balance,
  open,
  onOpenChange,
  onReceived,
}: {
  customer: { id: string; name: string };
  /** What they owe now: the default amount. */
  balance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReceived: (payment: CustomerPaymentDto) => void;
}) {
  const { t } = useTranslation(["accounts", "common"]);
  const money = useMoney();
  const queryClient = useQueryClient();
  const storeId = useAuthStore((s) => s.currentStoreId);
  const user = useAuthStore((s) => s.user);
  const deviceShift = useCurrentShift(storeId);
  const shift = deviceShift && deviceShift.openedBy.id === user?.id ? deviceShift : null;
  const needsShift = user?.role === "CASHIER" && !shift;
  const methods = PAYMENT_METHOD_ORDER.filter((m) => shift || m !== PaymentMethod.CASH);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>(methods[0]);
  const [reference, setReference] = React.useState("");
  const clientId = React.useRef(crypto.randomUUID());

  React.useEffect(() => {
    if (!open) return;
    setAmount(balance > 0 ? balance.toFixed(2) : "");
    setMethod(shift ? PaymentMethod.CASH : PaymentMethod.BANK_TRANSFER);
    setReference("");
    clientId.current = crypto.randomUUID();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const value = Number(amount);
  const valid = value > 0 && value <= balance + 0.0001 && !needsShift;
  const mutation = useMutation({
    mutationFn: () =>
      receivePayment({
        storeId: storeId!,
        customerId: customer.id,
        amount: Math.round(value * 100) / 100,
        method,
        reference: reference.trim() || undefined,
        shiftClientId: shift?.clientId,
        clientId: clientId.current,
      }),
    onSuccess: (payment) => {
      if (shift) useShiftStore.getState().recordReceipt({ id: payment.id, method: payment.method, amount: Number(payment.amount) });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-account", customer.id] });
      void queryClient.invalidateQueries({ queryKey: ["customer-card", customer.id] });
      toast.success(t("receive.done", { number: payment.document.documentNo }));
      onOpenChange(false);
      onReceived(payment);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("receive.title", { name: customer.name })}</DialogTitle>
          <DialogDescription>{t("receive.description", { balance: money(balance) })}</DialogDescription>
        </DialogHeader>
        {needsShift ? (
          <p className="text-sm text-destructive">{t("receive.needsShift")}</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) mutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="receive-amount">{t("receive.amount")}</Label>
              <Input id="receive-amount" type="number" step="0.01" min="0.01" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
              {value > balance + 0.0001 && <p className="text-sm text-destructive">{t("receive.tooMuch", { balance: money(balance) })}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="receive-method">{t("receive.method")}</Label>
              <Combobox
                id="receive-method"
                value={method}
                onChange={(v) => v && setMethod(v as PaymentMethod)}
                options={methods.map((m) => ({ value: m, label: t(`common:paymentMethods.${m}`) }))}
              />
              {!shift && <p className="text-xs text-muted-foreground">{t("receive.noCashWithoutShift")}</p>}
            </div>
            {method !== PaymentMethod.CASH && (
              <div className="space-y-1.5">
                <Label htmlFor="receive-reference">{t("receive.reference")}</Label>
                <Input id="receive-reference" maxLength={60} value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={!valid || mutation.isPending}>
              {mutation.isPending ? t("common:actions.saving") : t("receive.submit", { amount: money(value || 0) })}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
