import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/features/auth/store";
import { useLockStore } from "../lock-store";
import { PinSignIn } from "./PinSignIn";

/**
 * Covers the till while it's locked. The page underneath (and its cart)
 * stays as it was; whoever unlocks becomes the signed-in person.
 */
export function LockOverlay() {
  const { t } = useTranslation("auth");
  const locked = useLockStore((s) => s.locked);
  const unlock = useLockStore((s) => s.unlock);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  if (!locked) return null;

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
          <h1 className="text-xl font-semibold">{t("pin.locked")}</h1>
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
      </div>
    </div>
  );
}
