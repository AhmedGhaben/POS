import * as React from "react";
import { useTranslation } from "react-i18next";
import { Permission } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useHasPermission } from "@/features/auth/use-permission";
import { useMoney } from "@/features/business/use-money";
import { requestApproval, type Approval } from "@/features/overrides/approval";
import { linePrice, type CartLine } from "../hooks/useCart";
import { NumericField } from "@/components/ui/numeric-field";
import { parseLinePrice } from "../line-price";

/**
 * Changes one item's price for this sale (e.g. a damaged box). Needs
 * CHANGE_PRICE, or a manager's approval that goes with the sale. The
 * receipt and the server keep the original price beside the new one.
 */
export function PriceDialog({
  line,
  onOpenChange,
  onApply,
}: {
  line: CartLine | null;
  onOpenChange: (open: boolean) => void;
  /** price null puts the product's price back. */
  onApply: (price: number | null, approval: Approval | null) => void;
}) {
  const { t } = useTranslation("pos");
  const money = useMoney();
  const canChange = useHasPermission(Permission.CHANGE_PRICE);
  const [value, setValue] = React.useState("");
  // A price of 0 gives the item away: asked first (tester #39).
  const [freeConfirmed, setFreeConfirmed] = React.useState(false);

  React.useEffect(() => {
    if (line) setValue(String(linePrice(line)));
    setFreeConfirmed(false);
  }, [line]);

  const { price, valid } = parseLinePrice(value);
  const original = line ? Number(line.product.sellPrice) : 0;
  const changed = valid && Math.abs(price - original) >= 0.005;
  const needsFreeConfirm = changed && price === 0 && !freeConfirmed;

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!line || !valid || needsFreeConfirm) return;
    if (!changed) {
      onApply(null, null);
      onOpenChange(false);
      return;
    }
    let approval: Approval | null = null;
    if (!canChange) {
      approval = await requestApproval({
        permission: Permission.CHANGE_PRICE,
        action: "sale.price",
        description: t("price.approval", { name: line.product.name, from: money(original), to: money(price) }),
        details: { productId: line.product.id, from: original, to: price },
      });
      if (!approval) return;
    }
    onApply(Math.round(price * 100) / 100, approval);
    onOpenChange(false);
  }

  return (
    <Dialog open={!!line} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("price.title", { name: line?.product.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("price.description", { price: money(original) })}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={apply}>
          <div className="space-y-1.5">
            <Label htmlFor="line-price">{t("price.label")}</Label>
            <NumericField id="line-price" autoFocus value={value} onValueChange={setValue} />
          </div>
          {changed && price === 0 && (
            <label className="flex items-start gap-2 rounded-md border border-amber-400/60 p-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={freeConfirmed} onChange={(e) => setFreeConfirmed(e.target.checked)} />
              <span>
                {t("price.makeFree")} <span className="font-medium">{t("price.makeFreeConfirm")}</span>
              </span>
            </label>
          )}
          {changed && !canChange && <p className="text-sm text-amber-700 dark:text-amber-400">{t("price.needsApproval")}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={line?.unitPrice == null}
              onClick={() => {
                onApply(null, null);
                onOpenChange(false);
              }}
            >
              {t("price.reset")}
            </Button>
            <Button type="submit" disabled={!valid || needsFreeConfirm}>
              {changed && !canChange ? t("discount.askApproval") : t("price.apply")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
