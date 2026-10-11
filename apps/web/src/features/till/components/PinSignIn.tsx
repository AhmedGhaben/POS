import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UserDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { useDeviceStore, type TillStaffMember } from "@/features/desktop/bridge";
import { signInWithPin } from "../session";
import { PinPad } from "./PinPad";

interface PinSignInProps {
  onSignedIn: (user: UserDto) => void;
  /** Shown first, e.g. whoever locked the till. */
  preferredUserId?: string | null;
}

function initials(m: TillStaffMember) {
  return `${m.firstName[0] ?? ""}${m.lastName[0] ?? ""}`.toUpperCase();
}

/** Tap your name, type your PIN. Works offline with the staff list saved on the till. */
export function PinSignIn({ onSignedIn, preferredUserId }: PinSignInProps) {
  const { t } = useTranslation("auth");
  const staff = useDeviceStore((s) => s.staff);
  const [selected, setSelected] = React.useState<TillStaffMember | null>(null);
  const [pin, setPin] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ordered = React.useMemo(
    () => (preferredUserId ? [...staff].sort((a, b) => Number(b.id === preferredUserId) - Number(a.id === preferredUserId)) : staff),
    [staff, preferredUserId],
  );

  async function submit() {
    if (!selected || pin.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    const result = await signInWithPin(selected.id, pin);
    setBusy(false);
    setPin("");
    if (result.ok) onSignedIn(result.user);
    else setError(t(`pin.errors.${result.code}`));
  }

  if (!selected) {
    return (
      <div className="space-y-3">
        <p className="text-center text-sm text-muted-foreground">{t("pin.whoAreYou")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ordered.map((m) => (
            <Button
              key={m.id}
              type="button"
              variant="outline"
              className="flex h-auto flex-col gap-1 py-3"
              onClick={() => {
                setSelected(m);
                setError(null);
              }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">{initials(m)}</span>
              <span className="max-w-full truncate text-sm">
                {m.firstName} {m.lastName}
              </span>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("pin.back")}
          onClick={() => {
            setSelected(null);
            setPin("");
            setError(null);
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="font-medium">{t("pin.enterFor", { name: `${selected.firstName} ${selected.lastName}` })}</p>
      </div>
      <PinPad value={pin} onChange={setPin} onSubmit={() => void submit()} disabled={busy} />
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}
