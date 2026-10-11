import * as React from "react";
import { useTranslation } from "react-i18next";
import { discountCents, toCents, type DiscountInput, type DiscountType } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";

const QUICK_PERCENTS = [5, 10, 15, 20];

interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What the discount comes off, in the currency (before tax). */
  base: number;
  current: DiscountInput | null | undefined;
  onApply: (discount: DiscountInput | null) => void;
}

/**
 * A percentage or an amount off a line or the whole sale. Owners have no
 * limit; everyone else stays within the business's maximum discount.
 */
export function DiscountDialog({ open, onOpenChange, title, base, current, onApply }: DiscountDialogProps) {
  const { t } = useTranslation("pos");
  const money = useMoney();
  const role = useAuthStore((s) => s.user?.role);
  const maxSetting = useAuthStore((s) => s.business?.maxDiscountPercent);
  const max = role !== "OWNER" && maxSetting != null ? Number(maxSetting) : null;
  const [type, setType] = React.useState<DiscountType>("PERCENT");
  const [value, setValue] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setType(current?.type ?? "PERCENT");
      setValue(current?.value ? String(current.value) : "");
    }
  }, [open, current]);

  const number = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(number) && number > 0;
  const baseCents = toCents(base);
  const off = valid ? discountCents(baseCents, { type, value: number }) : 0;
  const error = !valid
    ? null
    : type === "PERCENT" && number > 100
      ? t("discount.percentTooBig")
      : type === "AMOUNT" && toCents(number) > baseCents
        ? t("discount.tooBig")
        : max !== null && off > Math.round((baseCents * max) / 100)
          ? t("discount.overMax", { max })
          : null;

  function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || error) return;
    onApply({ type, value: Math.round(number * 100) / 100 });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("discount.description", { amount: money(base) })}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={apply}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("discount.kind")}>
            {(["PERCENT", "AMOUNT"] as const).map((k) => (
              <Button
                key={k}
                type="button"
                role="radio"
                aria-checked={type === k}
                variant={type === k ? "default" : "outline"}
                onClick={() => setType(k)}
              >
                {k === "PERCENT" ? t("discount.percent") : t("discount.amount")}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discount-value">{type === "PERCENT" ? t("discount.percentLabel") : t("discount.amountLabel")}</Label>
            <Input
              id="discount-value"
              inputMode="decimal"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          {type === "PERCENT" && (
            <div className="flex flex-wrap gap-2">
              {QUICK_PERCENTS.filter((p) => max === null || p <= max).map((p) => (
                <Button key={p} type="button" size="sm" variant="secondary" onClick={() => setValue(String(p))}>
                  {p}%
                </Button>
              ))}
            </div>
          )}
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            valid && (
              <p className="text-sm text-muted-foreground">
                {t("discount.preview", { off: money(off / 100), after: money((baseCents - off) / 100) })}
              </p>
            )
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!current}
              onClick={() => {
                onApply(null);
                onOpenChange(false);
              }}
            >
              {t("discount.remove")}
            </Button>
            <Button type="submit" disabled={!valid || !!error}>
              {t("discount.apply")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
