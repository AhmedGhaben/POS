import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCartDraft, useCartKey } from "@/features/pos/cart-store";
import { useLeftPos } from "@/features/pos/cart-guard";

/**
 * "Voltar ao POS": on any page reached from the sale screen (Settings,
 * This device, Dashboard, Products…), back to the same sale, with the
 * number of items still in its cart. Shown while there's a sale in the
 * cart, or after coming from the POS.
 */
export function BackToPos({ className }: { className?: string }) {
  const { t } = useTranslation();
  const left = useLeftPos((s) => s.left);
  const items = useCartDraft(useCartKey()).lines.length;
  if (!left && items === 0) return null;
  return (
    <Button asChild variant={items > 0 ? "default" : "outline"} size="sm" className={className}>
      <NavLink to="/pos">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("shell.backToPos")}
        {items > 0 && (
          <Badge variant="secondary" className="ml-1" aria-label={t("shell.cartItems", { count: items })}>
            {items}
          </Badge>
        )}
      </NavLink>
    </Button>
  );
}
