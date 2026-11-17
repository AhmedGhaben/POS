import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import { useLockStore } from "../lock-store";
import { PinSignIn } from "./PinSignIn";

/**
 * The till while it's locked (ProtectedRoute shows only this). The cart is
 * kept; whoever unlocks becomes the signed-in person. Also shown when the
 * Windows app starts on a registered till, so a restart never skips it.
 *
 * Someone who can't use a PIN here (forgotten, not set, not on this till's
 * list yet) signs out and in again with their email and password: the
 * session ends, nothing else changes (shifts, saved sales and the cart stay).
 */
export function LockOverlay() {
  const { t } = useTranslation("auth");
  const locked = useLockStore((s) => s.locked);
  const unlock = useLockStore((s) => s.unlock);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  if (!locked) return null;

  /** Ends the session (nothing else); sign-in then opens on the email form. */
  async function signOutForEmail() {
    useLockStore.getState().setEmailSignIn(true);
    await logout().catch(() => {});
    useAuthStore.getState().clearSession();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("pin.locked")}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background p-4"
    >
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="text-xl font-extrabold tracking-[-0.03em]">{t("pin.locked")}</h1>
          {user && <p className="text-sm text-muted-foreground">{t("pin.lockedBy", { name: `${user.firstName} ${user.lastName}` })}</p>}
        </div>
        <PinSignIn
          preferredUserId={user?.id}
          onSignedIn={(signedIn) => {
            const someoneElse = signedIn.id !== user?.id;
            unlock();
            if (someoneElse && signedIn.role === "CASHIER") navigate("/pos");
          }}
        />
        <Button
          type="button"
          variant="link"
          className="w-full"
          onClick={() => void signOutForEmail()}
        >
          {t("pin.useEmail")}
        </Button>
      </div>
    </div>
  );
}
