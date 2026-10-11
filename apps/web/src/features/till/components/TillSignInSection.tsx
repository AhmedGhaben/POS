import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeviceStore } from "@/features/desktop/bridge";
import { SetPinDialog } from "./SetPinDialog";

const AUTO_LOCK_CHOICES = [0, 1, 2, 5, 10, 15, 30];

/** This device: PIN sign-in on this till, auto-lock, and your own PIN. */
export function TillSignInSection() {
  const { t } = useTranslation("device");
  const terminal = useDeviceStore((s) => s.terminal);
  const hasKey = useDeviceStore((s) => s.hasKey);
  const staff = useDeviceStore((s) => s.staff);
  const autoLock = useDeviceStore((s) => s.autoLockMinutes);
  const setAutoLock = useDeviceStore((s) => s.setAutoLockMinutes);
  const [pinOpen, setPinOpen] = React.useState(false);

  const status = !terminal
    ? t("pinSignIn.registerFirst")
    : !hasKey
      ? t("pinSignIn.noKey")
      : staff.length === 0
        ? t("pinSignIn.noPins")
        : t("pinSignIn.ready", { count: staff.length });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pinSignIn.title")}</CardTitle>
        <CardDescription>{t("pinSignIn.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm" data-testid="pin-status">
          {status}
        </p>
        {staff.length > 0 && (
          <p className="text-sm text-muted-foreground">{staff.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <div className="space-y-1.5">
            <Label>{t("pinSignIn.autoLock")}</Label>
            <Select value={String(autoLock)} onValueChange={(v) => void setAutoLock(Number(v))}>
              <SelectTrigger aria-label={t("pinSignIn.autoLock")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_LOCK_CHOICES.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m === 0 ? t("pinSignIn.never") : t("pinSignIn.minutes", { count: m })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => setPinOpen(true)}>
            {t("pinSignIn.setMyPin")}
          </Button>
        </div>
        <SetPinDialog open={pinOpen} onOpenChange={setPinOpen} />
      </CardContent>
    </Card>
  );
}
