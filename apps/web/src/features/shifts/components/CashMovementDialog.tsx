import * as React from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { DrawerOpenReason, Permission, type CashMovementReason, type DrawerSubReason } from "@pos/shared";
import { useHasPermission } from "@/features/auth/use-permission";
import { requestApproval, type Approval } from "@/features/overrides/approval";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMoney } from "@/features/business/use-money";
import { openCashDrawer, useHasDrawer } from "@/features/desktop/drawer";
import { addCashMovement } from "../api";
import type { LocalShift } from "../ledger";
import { NumericField } from "@/components/ui/numeric-field";

const REASONS: Record<"IN" | "OUT", CashMovementReason[]> = {
  IN: ["CHANGE_TOPUP", "OTHER"],
  OUT: ["CASH_PICKUP", "PETTY_CASH", "OTHER"],
};

/** The drawer opening is recorded too, with the closest reason. */
const DRAWER_REASON: Record<CashMovementReason, DrawerSubReason> = {
  CASH_PICKUP: "CASH_PICKUP",
  PETTY_CASH: "OTHER",
  CHANGE_TOPUP: "FLOAT_ADJUSTMENT",
  OTHER: "OTHER",
};

/** Cash put into or taken out of the drawer during the shift. */
export function CashMovementDialog({ shift, open, onOpenChange }: { shift: LocalShift; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("shifts");
  const money = useMoney();
  const hasDrawer = useHasDrawer();
  const canCashOut = useHasPermission(Permission.CASH_OUT);
  const [type, setType] = React.useState<"IN" | "OUT">("OUT");
  const [reason, setReason] = React.useState<CashMovementReason>("CASH_PICKUP");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setType("OUT");
      setReason("CASH_PICKUP");
      setAmount("");
      setNote("");
    }
  }, [open]);

  const value = Number(amount.replace(",", "."));
  const valid = Number.isFinite(value) && value > 0 && (reason !== "OTHER" || note.trim() !== "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    const rounded = Math.round(value * 100) / 100;
    // Taking cash out needs CASH_OUT, or a manager's approval for this once.
    let approval: Approval | null = null;
    if (type === "OUT" && !canCashOut) {
      approval = await requestApproval({
        permission: Permission.CASH_OUT,
        action: "cash.out",
        description: t("movement.approval", { amount: money(rounded), reason: t(`reasons.${reason}`) }),
        details: { amount: rounded, reason },
      });
      if (!approval) return;
    }
    setBusy(true);
    await addCashMovement(shift, { type, amount: rounded, reason, note, approval });
    if (hasDrawer) {
      void openCashDrawer({ reason: DrawerOpenReason.MANUAL_OPEN, subReason: DRAWER_REASON[reason], note: t(`reasons.${reason}`) });
    }
    setBusy(false);
    toast.success(type === "IN" ? t("movement.addedIn", { amount: money(rounded) }) : t("movement.addedOut", { amount: money(rounded) }));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("movement.title")}</DialogTitle>
          <DialogDescription>{t("movement.description")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("movement.kind")}>
            {(["OUT", "IN"] as const).map((k) => (
              <Button
                key={k}
                type="button"
                role="radio"
                aria-checked={type === k}
                variant={type === k ? "default" : "outline"}
                onClick={() => {
                  setType(k);
                  setReason(REASONS[k][0]);
                }}
              >
                {k === "IN" ? t("movement.in") : t("movement.out")}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="movement-amount">{t("movement.amount")}</Label>
            <NumericField id="movement-amount" autoFocus value={amount} onValueChange={setAmount} />
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t("movement.reason")}</legend>
            {REASONS[type].map((r) => (
              <label key={r} className="flex items-center gap-3 text-sm">
                <input type="radio" name="movement-reason" className="h-4 w-4" checked={reason === r} onChange={() => setReason(r)} />
                {t(`reasons.${r}`)}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="movement-note">{reason === "OTHER" ? t("movement.note") : t("movement.noteOptional")}</Label>
            <Textarea id="movement-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={!valid || busy}>
            {type === "IN" ? t("movement.submitIn") : t("movement.submitOut")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
