import * as React from "react";
import { Minus, Percent, Plus, Tag, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fromCents, lineGrossCents, roundQuantity, unitDecimals, type PricedLine } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { linePrice, type CartLine } from "@/features/pos/hooks/useCart";
import { useMoney } from "@/features/business/use-money";
import { discountLabel } from "../discount-label";
import { parseQuantity } from "../quantity";

interface CartProps {
  lines: CartLine[];
  /** The cart's lines priced (same order), for line discounts. */
  priced: PricedLine[];
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  /** Discount on a line (a manager approves it if the person may not). */
  onDiscount?: (line: CartLine) => void;
  /** Change a line's price (likewise). */
  onChangePrice?: (line: CartLine) => void;
}

/**
 * A line's quantity, typed straight in: Enter or leaving the field applies
 * it, Esc or anything that isn't a quantity puts the old one back.
 */
function QuantityField({ value, unit, label, onCommit }: { value: number; unit: string; label: string; onCommit: (quantity: number) => void }) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);
  // Weighed and measured products take up to 3 decimals (0,765 kg).
  const decimals = unitDecimals(unit);

  function commit() {
    const quantity = parseQuantity(text, decimals);
    if (quantity === null || quantity === value) setText(String(value));
    else onCommit(quantity);
  }

  return (
    <input
      data-keep-focus
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      aria-label={label}
      className={`h-7 ${decimals > 0 ? "w-16" : "w-12"} rounded-md border border-input bg-background text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring`}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(String(value));
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function Cart({ lines, priced, onSetQuantity, onRemove, onDiscount, onChangePrice }: CartProps) {
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
                {line.product.unit && line.product.unit !== "un"
                  ? t("cart.perUnit", { price: money(linePrice(line)), unit: line.product.unit })
                  : t("cart.each", { price: money(linePrice(line)) })}
                {line.unitPrice != null && (
                  <span className="ml-1 text-amber-700 dark:text-amber-400">
                    {t("cart.priceChanged", { price: money(line.product.sellPrice) })}
                  </span>
                )}
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
                onClick={() => onSetQuantity(line.product.id, roundQuantity(line.quantity - 1, line.product.unit))}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <QuantityField
                value={line.quantity}
                unit={line.product.unit ?? "un"}
                label={t("cart.quantityFor", { name: line.product.name })}
                onCommit={(quantity) => onSetQuantity(line.product.id, quantity)}
              />
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                aria-label={t("cart.increase")}
                onClick={() => onSetQuantity(line.product.id, roundQuantity(line.quantity + 1, line.product.unit))}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="w-20 text-right">
              {discounted && (
                <p className="text-xs text-muted-foreground line-through">{money(p.gross)}</p>
              )}
              <p className="text-sm font-medium">{money(p ? p.gross - p.lineDiscount : fromCents(lineGrossCents(linePrice(line), line.quantity)))}</p>
            </div>
            {onChangePrice && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground"
                aria-label={t("cart.priceNamed", { name: line.product.name })}
                title={t("cart.price")}
                onClick={() => onChangePrice(line)}
              >
                <Tag className="h-3.5 w-3.5" />
              </Button>
            )}
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
