import * as React from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeviceStore } from "@/features/desktop/bridge";
import { clearUserPin, setMyPin, setUserPin } from "@/features/users/api";
import { ApiError } from "@/lib/api-client";
import { NumericField } from "@/components/ui/numeric-field";

const PIN = /^\d{4,6}$/;

interface SetPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Someone else's PIN (owner); absent for your own, which needs your password. */
  user?: { id: string; name: string; hasPin: boolean };
  onSaved?: () => void;
}

/** Sets a till PIN: your own (with your password), or a staff member's (owner). */
export function SetPinDialog({ open, onOpenChange, user, onSaved }: SetPinDialogProps) {
  const { t } = useTranslation(["auth", "common"]);
  const [password, setPassword] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setPassword("");
      setPin("");
      setAgain("");
      setError(null);
    }
  }, [open]);

  async function done(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast.success(message);
      void useDeviceStore.getState().refreshTill(true);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("pin.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!PIN.test(pin)) return setError(t("pin.format"));
    if (pin !== again) return setError(t("pin.mismatch"));
    void done(() => (user ? setUserPin(user.id, pin) : setMyPin(pin, password)), t("pin.saved"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{user ? t("pin.setFor", { name: user.name }) : t("pin.setMine")}</DialogTitle>
          <DialogDescription>{t("pin.setHint")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {!user && (
            <div className="space-y-1.5">
              <Label htmlFor="pin-password">{t("fields.password")}</Label>
              <Input id="pin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pin-new">{t("pin.newPin")}</Label>
            <NumericField id="pin-new" type="password" keypad="popover" decimals={0} maxLength={6} value={pin} onValueChange={(v) => setPin(v.replace(/\D/g, ""))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pin-again">{t("pin.again")}</Label>
            <NumericField id="pin-again" type="password" keypad="popover" decimals={0} maxLength={6} value={again} onValueChange={(v) => setAgain(v.replace(/\D/g, ""))} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {t("pin.save")}
          </Button>
          {user?.hasPin && (
            <Button
              type="button"
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void done(() => clearUserPin(user.id), t("pin.removed"))}
            >
              {t("pin.remove")}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
