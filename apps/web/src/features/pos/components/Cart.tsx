import { Minus, Percent, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PricedLine } from "@pos/shared";
import { Button } from "@/components/ui/button";
import type { CartLine } from "@/features/pos/hooks/useCart";
import { useMoney } from "@/features/business/use-money";
import { discountLabel } from "../discount-label";

interface CartProps {
  lines: CartLine[];
  /** The cart's lines priced (same order), for line discounts. */
  priced: PricedLine[];
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  /** Present when this person may give discounts. */
  onDiscount?: (line: CartLine) => void;
}

export function Cart({ lines, priced, onSetQuantity, onRemove, onDiscount }: CartProps) {
  const { t } = useTranslation("pos");
  const money = useMoney();
  if (lines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t("cart.empty")}
      </div>
    );
  }

  return (
    <div className="flex-1 divide-y overflow-y-auto">
      {lines.map((line, i) => {
        const p = priced[i];
        const discounted = !!p && p.lineDiscount > 0;
        return (
          <div key={line.product.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium">{line.product.name}</p>
              <p className="text-xs text-muted-foreground">
                {t("cart.each", { price: money(line.product.sellPrice) })}
              </p>
              {discounted && line.discount && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {t("cart.discountOff", { label: discountLabel(line.discount, money), amount: money(p.lineDiscount) })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                aria-label={t("cart.decrease")}
                onClick={() => onSetQuantity(line.product.id, line.quantity - 1)}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-8 text-center text-sm">{line.quantity}</span>
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                aria-label={t("cart.increase")}
                onClick={() => onSetQuantity(line.product.id, line.quantity + 1)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="w-20 text-right">
              {discounted && (
                <p className="text-xs text-muted-foreground line-through">{money(p.gross)}</p>
              )}
              <p className="text-sm font-medium">{money(p ? p.gross - p.lineDiscount : Number(line.product.sellPrice) * line.quantity)}</p>
            </div>
            {onDiscount && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground"
                aria-label={t("cart.discountNamed", { name: line.product.name })}
                title={t("cart.discount")}
                onClick={() => onDiscount(line)}
              >
                <Percent className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              aria-label={t("cart.remove", { name: line.product.name })}
              onClick={() => onRemove(line.product.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
