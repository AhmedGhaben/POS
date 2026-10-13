import { Play, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMoney } from "@/features/business/use-money";
import { formatDateTime } from "@/lib/format";
import { useHeldOrders, useStoreHeldOrders, itemCount, type HeldOrder } from "../held-orders";
import { priceCart } from "../hooks/useCart";

interface HeldOrdersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  /** Carry on with this order (it's taken off the list). */
  onResume: (order: HeldOrder) => void;
}

/** "Vendas pendentes": orders put on hold on this till, to pick up again. */
export function HeldOrdersSheet({ open, onOpenChange, storeId, onResume }: HeldOrdersSheetProps) {
  const { t } = useTranslation("pos");
  const money = useMoney();
  const orders = useStoreHeldOrders(storeId);
  const discard = useHeldOrders((s) => s.discard);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("held.title")}</SheetTitle>
          <SheetDescription>{t("held.description")}</SheetDescription>
        </SheetHeader>
        {orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("held.empty")}</p>
        ) : (
          <ul className="-mx-2 flex-1 divide-y overflow-y-auto">
            {orders.map((order) => (
              <li key={order.id} className="flex items-center gap-2 px-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {order.note || order.customer?.name || t("held.untitled")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("held.summary", { count: itemCount(order), time: formatDateTime(order.heldAt), name: order.heldBy.name })}
                  </p>
                </div>
                <span className="text-sm font-medium">{money(priceCart(order.lines, order.saleDiscount).total)}</span>
                <Button
                  size="sm"
                  aria-label={t("held.resumeNamed", { name: order.note || order.customer?.name || t("held.untitled") })}
                  onClick={() => onResume(order)}
                >
                  <Play className="mr-1 h-3.5 w-3.5" /> {t("held.resume")}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground"
                  aria-label={t("held.discard")}
                  title={t("held.discard")}
                  onClick={() => discard(order.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
