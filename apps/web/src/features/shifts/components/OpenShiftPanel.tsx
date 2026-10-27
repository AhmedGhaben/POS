import * as React from "react";
import { useTranslation } from "react-i18next";
import { DrawerOpenReason } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { openCashDrawer, useHasDrawer } from "@/features/desktop/drawer";
import { openShift } from "../api";
import { NumericField } from "@/components/ui/numeric-field";

/** Before the first sale: how much cash is in the drawer to start with. */
export function OpenShiftPanel({ storeId }: { storeId: string }) {
  const { t } = useTranslation("shifts");
  const hasDrawer = useHasDrawer();
  const [float, setFloat] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const amount = Number(float.replace(",", "."));
  const valid = float.trim() !== "" && Number.isFinite(amount) && amount >= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    await openShift(storeId, Math.round(amount * 100) / 100);
    if (hasDrawer) void openCashDrawer({ reason: DrawerOpenReason.SHIFT_OPEN });
    setBusy(false);
  }

  return (
    <form className="space-y-3 rounded-lg border p-4" onSubmit={submit}>
      <div>
        <p className="font-semibold">{t("open.title")}</p>
        <p className="text-sm text-muted-foreground">{t("open.description")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="opening-float">{t("open.float")}</Label>
        <NumericField id="opening-float" autoFocus value={float} onValueChange={setFloat} />
      </div>
      <Button type="submit" className="w-full" disabled={!valid || busy}>
        {t("open.submit")}
      </Button>
    </form>
  );
}
