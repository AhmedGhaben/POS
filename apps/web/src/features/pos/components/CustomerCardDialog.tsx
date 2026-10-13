import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SaleStatus, type CustomerCardDto, type CustomerDto } from "@pos/shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMoney } from "@/features/business/use-money";
import { apiClient } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";

/** The customer card at the till: contact, NIF, what they've bought and their last sales. */
export function CustomerCardDialog({ customer, onClose }: { customer: CustomerDto | null; onClose: () => void }) {
  const { t } = useTranslation("pos");
  const money = useMoney();
  const card = useQuery({
    queryKey: ["customer-card", customer?.id],
    queryFn: () => apiClient.get<CustomerCardDto>(`/customers/${customer!.id}/card`),
    enabled: !!customer,
  });
  const c = card.data?.customer ?? customer;

  return (
    <Dialog open={!!customer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{c?.name}</DialogTitle>
          <DialogDescription>{t("card.title")}</DialogDescription>
        </DialogHeader>
        {c && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("card.taxId")}</dt>
            <dd>{c.taxId || "—"}</dd>
            <dt className="text-muted-foreground">{t("card.phone")}</dt>
            <dd>{c.phone || "—"}</dd>
            <dt className="text-muted-foreground">{t("card.email")}</dt>
            <dd className="break-all">{c.email || "—"}</dd>
            <dt className="text-muted-foreground">{t("card.address")}</dt>
            <dd className="whitespace-pre-line">{c.address || "—"}</dd>
          </dl>
        )}
        {card.isError && <p className="text-sm text-muted-foreground">{t("card.offline")}</p>}
        {card.data && (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-md border p-3 text-center text-sm">
              <div>
                <p className="text-lg font-semibold">{card.data.purchases.count}</p>
                <p className="text-xs text-muted-foreground">{t("card.purchases")}</p>
              </div>
              <div>
                <p className="text-lg font-semibold">{money(card.data.purchases.total)}</p>
                <p className="text-xs text-muted-foreground">{t("card.spent")}</p>
              </div>
              <div>
                <p className="text-lg font-semibold">{card.data.purchases.lastAt ? formatDate(card.data.purchases.lastAt) : "—"}</p>
                <p className="text-xs text-muted-foreground">{t("card.last")}</p>
              </div>
            </div>
            {card.data.recent.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">{t("card.recent")}</p>
                <ul className="divide-y rounded-md border text-sm">
                  {card.data.recent.map((s) => (
                    <li key={s.id} className={`flex justify-between gap-2 px-3 py-1.5 ${s.status === SaleStatus.VOIDED ? "text-muted-foreground line-through" : ""}`}>
                      <span>
                        {s.receiptNumber} <span className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</span>
                      </span>
                      <span>{money(s.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
