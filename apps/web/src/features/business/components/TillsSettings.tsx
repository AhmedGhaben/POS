import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TerminalDto } from "@pos/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { storeOptions } from "@/lib/options";
import { useAuthStore } from "@/features/auth/store";
import { createPairingCode, fetchTerminals, updateTerminal } from "@/features/desktop/api";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

/** Settings: the business's tills, and codes for setting up new ones. */
export function TillsSettings() {
  const { t, i18n } = useTranslation("settings");
  const queryClient = useQueryClient();
  const stores = useAuthStore((s) => s.stores);
  const tills = useQuery({ queryKey: ["terminals"], queryFn: fetchTerminals });
  const [adding, setAdding] = React.useState(false);

  const toggle = useMutation({
    mutationFn: (till: TerminalDto) => updateTerminal(till.id, { isActive: !till.isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["terminals"] }),
  });
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "";

  return (
    <div className="space-y-4">
      {tills.data && tills.data.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {tills.data.map((till) => (
            <li key={till.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {till.code} {till.name} {!till.isActive && <Badge variant="secondary">{t("tillsList.inactive")}</Badge>}
                </p>
                <p className="text-muted-foreground">
                  {storeName(till.storeId)}
                  {" · "}
                  {till.lastSeenAt ? t("tillsList.lastSeen", { when: formatDateTime(till.lastSeenAt, i18n.language) }) : t("tillsList.neverSeen")}
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(till)}>
                {till.isActive ? t("tillsList.deactivate") : t("tillsList.reactivate")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("tillsList.none")}</p>
      )}
      <Button onClick={() => setAdding(true)}>{t("tillsList.add")}</Button>
      <AddTillDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}

function AddTillDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const stores = useAuthStore((s) => s.stores);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const [storeId, setStoreId] = React.useState(currentStoreId ?? "");
  const [name, setName] = React.useState("");
  const [result, setResult] = React.useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (open) {
      setName("");
      setResult(null);
      setError(null);
      setStoreId(currentStoreId ?? stores[0]?.id ?? "");
    }
  }, [open, currentStoreId, stores]);

  // The countdown, and a fresh list once the new till has used its code.
  React.useEffect(() => {
    if (!result) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      void queryClient.invalidateQueries({ queryKey: ["terminals"] });
    }, 5000);
    return () => clearInterval(timer);
  }, [result, queryClient]);

  const create = useMutation({
    mutationFn: () => createPairingCode({ storeId, name: name.trim() }),
    onSuccess: (r) => {
      setResult({ code: r.code, expiresAt: r.expiresAt });
      setNow(Date.now());
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : String(err)),
  });

  const minutesLeft = result ? Math.max(0, Math.ceil((Date.parse(result.expiresAt) - now) / 60_000)) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("tillsList.addTitle")}</DialogTitle>
          <DialogDescription>{result ? t("tillsList.codeHint") : t("tillsList.addDescription")}</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 text-center">
            <p className="font-mono text-4xl font-semibold tracking-[0.3em]" data-testid="till-code">
              {result.code}
            </p>
            <p className="text-sm text-muted-foreground">
              {minutesLeft > 0 ? t("tillsList.expiresIn", { count: minutesLeft }) : t("tillsList.expired")}
            </p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              {t("tillsList.close")}
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && storeId) create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-till-name">{t("tillsList.name")}</Label>
              <Input id="new-till-name" maxLength={60} placeholder={t("tillsList.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("tillsList.store")}</Label>
              <Combobox
                value={storeId}
                onChange={(v) => v !== null && setStoreId(v)}
                aria-label={t("tillsList.store")}
                options={storeOptions(stores)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!name.trim() || !storeId || create.isPending}>
              {t("tillsList.getCode")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
