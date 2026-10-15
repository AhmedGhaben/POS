import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PAYMENT_METHOD_ORDER, PaymentMethod, type SupplierDto } from "@pos/shared";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMoney } from "@/features/business/use-money";
import { ApiError } from "@/lib/api-client";
import { formatCalendarDate } from "@/lib/format";
import { cancelSupplierPayment, fetchSupplierAccount, paySupplier } from "../api";

const STATUS_VARIANT = { PAID: "secondary", PARTIAL: "outline", UNPAID: "outline" } as const;

/**
 * What is owed to a supplier: their purchases (less IVA cativo, which goes
 * to the State) and what was paid, oldest first. Pay them, or cancel a
 * payment made by mistake.
 */
export function SupplierAccountSheet({ supplier, onClose }: { supplier: SupplierDto | null; onClose: () => void }) {
  const { t } = useTranslation(["accounts", "common"]);
  const money = useMoney();
  const queryClient = useQueryClient();
  const [paying, setPaying] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const account = useQuery({ queryKey: ["supplier-account", supplier?.id], queryFn: () => fetchSupplierAccount(supplier!.id), enabled: !!supplier });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["supplier-account", supplier?.id] });
    void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    void queryClient.invalidateQueries({ queryKey: ["purchases"] });
  };
  const cancel = useMutation({
    mutationFn: () => cancelSupplierPayment(cancelling!, reason.trim()),
    onSuccess: () => {
      refresh();
      toast.success(t("supplierAccount.cancelled"));
      setCancelling(null);
      setReason("");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });
  const a = account.data;
  const date = (d: string) => formatCalendarDate(d.slice(0, 10), { dateStyle: "short" });

  return (
    <>
      <Sheet open={!!supplier} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto p-4 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{supplier?.name}</SheetTitle>
            <SheetDescription>{supplier?.taxId ? `NIF ${supplier.taxId}` : t("account.noNif")}</SheetDescription>
          </SheetHeader>
          {!a ? (
            <p className="text-sm text-muted-foreground">{account.isError ? t("failed") : t("common:actions.loading")}</p>
          ) : (
            <>
              <div className="rounded-md border p-3 text-sm">
                <p className="text-muted-foreground">{t("supplierAccount.owed")}</p>
                <p className="text-lg font-semibold" data-testid="supplier-balance">{money(a.balance)}</p>
              </div>
              <Button disabled={Number(a.balance) <= 0} onClick={() => setPaying(true)}>
                {t("supplierAccount.pay")}
              </Button>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t("supplierAccount.purchases")}</h3>
                {a.purchases.length === 0 && <p className="text-sm text-muted-foreground">{t("supplierAccount.noPurchases")}</p>}
                {a.purchases.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{p.supplierDocNo ?? p.purchaseNumber}</span>
                      <span className="block text-xs text-muted-foreground">
                        {date(p.date)} · {t("supplierAccount.payable", { amount: money(p.payable) })}
                        {Number(p.paid) > 0 && ` · ${t("supplierAccount.paidSoFar", { amount: money(p.paid) })}`}
                      </span>
                    </span>
                    <Badge variant={STATUS_VARIANT[p.paymentStatus]}>
                      {p.paymentStatus === "PAID" ? t("account.paid") : t("account.open", { amount: money(p.open) })}
                    </Badge>
                  </div>
                ))}
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t("supplierAccount.payments")}</h3>
                {a.payments.length === 0 && <p className="text-sm text-muted-foreground">{t("supplierAccount.noPayments")}</p>}
                {a.payments.map((p) => (
                  <div key={p.id} className={`rounded-md border px-3 py-2 text-sm ${p.cancelledAt ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">{date(p.paidOn)} · {t(`common:paymentMethods.${p.method}`)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[p.reference, p.allocations.map((x) => x.supplierDocNo ?? x.purchaseNumber).join(", ")].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="font-semibold">{money(p.amount)}</span>
                    </div>
                    {p.cancelledAt ? (
                      <Badge variant="destructive" className="mt-1">{t("supplierAccount.cancelledBadge")}</Badge>
                    ) : (
                      <Button size="sm" variant="ghost" className="mt-1 text-destructive" onClick={() => setCancelling(p.id)}>
                        {t("supplierAccount.cancel")}
                      </Button>
                    )}
                  </div>
                ))}
              </section>
            </>
          )}
        </SheetContent>
      </Sheet>
      {supplier && a && <PaySupplierDialog supplier={supplier} balance={Number(a.balance)} open={paying} onOpenChange={setPaying} onPaid={refresh} />}
      <Dialog open={!!cancelling} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("supplierAccount.cancelTitle")}</DialogTitle>
            <DialogDescription>{t("supplierAccount.cancelDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length >= 3) cancel.mutate();
            }}
          >
            <Input aria-label={t("account.annulReason")} placeholder={t("account.annulReason")} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            <Button type="submit" variant="destructive" className="w-full" disabled={reason.trim().length < 3 || cancel.isPending}>
              {t("supplierAccount.cancel")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PaySupplierDialog({ supplier, balance, open, onOpenChange, onPaid }: { supplier: SupplierDto; balance: number; open: boolean; onOpenChange: (open: boolean) => void; onPaid: () => void }) {
  const { t } = useTranslation(["accounts", "common"]);
  const money = useMoney();
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>(PaymentMethod.BANK_TRANSFER);
  const [reference, setReference] = React.useState("");
  const [paidOn, setPaidOn] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setAmount(balance.toFixed(2));
    setReference("");
    setPaidOn("");
  }, [open, balance]);
  const value = Number(amount);
  const valid = value > 0 && value <= balance + 0.0001;
  const pay = useMutation({
    mutationFn: () => paySupplier({ supplierId: supplier.id, amount: Math.round(value * 100) / 100, method, reference: reference.trim() || undefined, paidOn: paidOn || undefined }),
    onSuccess: () => {
      onPaid();
      toast.success(t("supplierAccount.paid", { amount: money(value) }));
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("supplierAccount.payTitle", { name: supplier.name })}</DialogTitle>
          <DialogDescription>{t("supplierAccount.payDescription", { balance: money(balance) })}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) pay.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">{t("receive.amount")}</Label>
            <Input id="pay-amount" type="number" step="0.01" min="0.01" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-method">{t("receive.method")}</Label>
              <Combobox id="pay-method" value={method} onChange={(v) => v && setMethod(v as PaymentMethod)} options={PAYMENT_METHOD_ORDER.map((m) => ({ value: m, label: t(`common:paymentMethods.${m}`) }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">{t("supplierAccount.paidOn")}</Label>
              <Input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-reference">{t("receive.reference")}</Label>
            <Input id="pay-reference" maxLength={60} value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={!valid || pay.isPending}>
            {pay.isPending ? t("common:actions.saving") : t("supplierAccount.payButton", { amount: money(value || 0) })}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
