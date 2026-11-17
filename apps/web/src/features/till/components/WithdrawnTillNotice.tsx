import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import { desktop } from "@/features/desktop/bridge";
import { useLockStore } from "../lock-store";

/**
 * Shown when the server says this till isn't registered any more (its key
 * was withdrawn or replaced). A manager can switch it back on in Settings,
 * or the till is set up again here: the Windows app checks with the server
 * first and forgets only the registration (saved sales, printers and the
 * server address stay). Whoever was signed in is signed out first.
 */
export function WithdrawnTillNotice() {
  const { t } = useTranslation("auth");
  const withdrawn = useLockStore((s) => s.tillWithdrawn);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  if (!withdrawn || !desktop?.terminal.forgetWithdrawn) return null;

  async function setUpAgain() {
    setBusy(true);
    setProblem(null);
    const result = await desktop!.terminal.forgetWithdrawn!().catch(() => ({ ok: false as const, reason: "unreachable" as const }));
    if (!result.ok) {
      setBusy(false);
      if (result.reason === "valid") useLockStore.getState().setTillWithdrawn(false);
      setProblem(t(result.reason === "valid" ? "withdrawn.stillRegistered" : "withdrawn.unreachable"));
      return;
    }
    await logout().catch(() => {});
    useAuthStore.getState().clearSession();
    // A fresh start as an unregistered till: the setup wizard (till code, or a manager registers it).
    window.location.assign("/setup");
  }

  return (
    <div role="alert" className="space-y-2 rounded-md border p-3 text-sm">
      <p className="font-medium">{t("withdrawn.title")}</p>
      <p className="text-muted-foreground">{t("withdrawn.body")}</p>
      <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void setUpAgain()}>
        {t("withdrawn.action")}
      </Button>
      {problem && <p className="text-destructive">{problem}</p>}
    </div>
  );
}
