import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Permission, type CustomerDto } from "@pos/shared";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHasPermission } from "@/features/auth/use-permission";
import { useMoney } from "@/features/business/use-money";
import { FiscalDocumentDialog } from "@/features/fiscal/components/FiscalDocumentDialog";
import { useShiftStore } from "@/features/shifts/shift-store";
import { ApiError } from "@/lib/api-client";
import { formatCalendarDate } from "@/lib/format";
import { annulPayment, fetchCustomerAccount } from "../api";
import { ReceivePaymentDialog } from "./ReceivePaymentDialog";

/**
 * A customer's account: credit limit, what they owe, their invoices on
 * credit and the receipts for what they paid. Take a payment, reprint or
 * annul a receipt (annulling needs VOID_SALE).
 */
export function CustomerAccountSheet({ customer, onClose }: { customer: CustomerDto | null; onClose: () => void }) {
  const { t } = useTranslation(["accounts", "common"]);
  const money = useMoney();
  const queryClient = useQueryClient();
  const canAnnul = useHasPermission(Permission.VOID_SALE);
  const [receiving, setReceiving] = React.useState(false);
  const [viewing, setViewing] = React.useState<string | null>(null);
  const [annulling, setAnnulling] = React.useState<{ id: string; documentNo: string } | null>(null);
  const [reason, setReason] = React.useState("");
  const account = useQuery({
    queryKey: ["customer-account", customer?.id],
    queryFn: () => fetchCustomerAccount(customer!.id),
    enabled: !!customer,
  });
  const annul = useMutation({
    mutationFn: () => annulPayment(annulling!.id, reason.trim()),
    onSuccess: (payment) => {
      useShiftStore.getState().recordReceipt({ id: payment.id, method: payment.method, amount: Number(payment.amount), voided: true });
      void queryClient.invalidateQueries({ queryKey: ["customer-account", customer?.id] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(t("account.annulled", { number: payment.document.documentNo }));
      setAnnulling(null);
      setReason("");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });
  const a = account.data;
  const date = (d: string) => formatCalendarDate(d);

  return (
    <>
      <Sheet open={!!customer} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto p-4 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{customer?.name}</SheetTitle>
            <SheetDescription>{customer?.taxId ? `NIF ${customer.taxId}` : t("account.noNif")}</SheetDescription>
          </SheetHeader>
          {!a ? (
            <p className="text-sm text-muted-foreground">{account.isError ? t("failed") : t("common:actions.loading")}</p>
          ) : (
            <>
              <dl className="grid grid-cols-3 gap-2 rounded-md border p-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("account.balance")}</dt>
                  <dd className="text-lg font-semibold" data-testid="account-balance">{money(a.balance)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("account.limit")}</dt>
                  <dd className="font-medium">{a.creditLimit === null ? t("account.noCredit") : money(a.creditLimit)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("account.available")}</dt>
                  <dd className="font-medium">{a.available === null ? "—" : money(a.available)}</dd>
                </div>
              </dl>
              <Button disabled={Number(a.balance) <= 0} onClick={() => setReceiving(true)}>
                {t("account.receive")}
              </Button>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t("account.invoices")}</h3>
                {a.invoices.length === 0 && <p className="text-sm text-muted-foreground">{t("account.noInvoices")}</p>}
                {a.invoices.map((i) => (
                  <button key={i.id} type="button" className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setViewing(i.id)}>
                    <span>
                      <span className="font-medium">{i.documentNo}</span>
                      <span className="block text-xs text-muted-foreground">
                        {date(i.date)} · {t("account.invoiceTotal", { total: money(i.grossTotal) })}
                        {Number(i.credited) > 0 && ` · ${t("account.credited", { amount: money(i.credited) })}`}
                      </span>
                    </span>
                    {Number(i.open) > 0 ? <Badge variant="outline">{t("account.open", { amount: money(i.open) })}</Badge> : <Badge variant="secondary">{t("account.paid")}</Badge>}
                  </button>
                ))}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t("account.receipts")}</h3>
                {a.payments.length === 0 && <p className="text-sm text-muted-foreground">{t("account.noReceipts")}</p>}
                {a.payments.map((p) => (
                  <div key={p.id} className={`rounded-md border px-3 py-2 text-sm ${p.document.status === "A" ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">{p.document.documentNo}</span>
                        <span className="block text-xs text-muted-foreground">
                          {date(p.document.invoiceDate)} · {t(`common:paymentMethods.${p.method}`)}
                          {p.reference ? ` · ${p.reference}` : ""}
                          {p.allocations.length > 0 && ` · ${p.allocations.map((x) => x.documentNo).join(", ")}`}
                        </span>
                      </span>
                      <span className="font-semibold">{money(p.amount)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {p.document.status === "A" ? (
                        <Badge variant="destructive">{t("account.annulledBadge")}</Badge>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setViewing(p.document.id)}>
                            {t("common:actions.print")}
                          </Button>
                          {canAnnul && !p.saleId && (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAnnulling({ id: p.id, documentNo: p.document.documentNo })}>
                              {t("account.annul")}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}
        </SheetContent>
      </Sheet>

      {customer && a && (
        <ReceivePaymentDialog
          customer={customer}
          balance={Number(a.balance)}
          open={receiving}
          onOpenChange={setReceiving}
          onReceived={(payment) => setViewing(payment.document.id)}
        />
      )}
      <FiscalDocumentDialog documentId={viewing} onClose={() => setViewing(null)} />
      <Dialog open={!!annulling} onOpenChange={(open) => !open && setAnnulling(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("account.annulTitle", { number: annulling?.documentNo ?? "" })}</DialogTitle>
            <DialogDescription>{t("account.annulDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length >= 3) annul.mutate();
            }}
          >
            <Input aria-label={t("account.annulReason")} placeholder={t("account.annulReason")} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            <Button type="submit" variant="destructive" className="w-full" disabled={reason.trim().length < 3 || annul.isPending}>
              {t("account.annul")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
