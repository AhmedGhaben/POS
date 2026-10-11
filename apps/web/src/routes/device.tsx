import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FolderOpen, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/store";
import { createTerminal, updateTerminal } from "@/features/desktop/api";
import { PrintersSection } from "@/features/desktop/components/PrintersSection";
import { DrawerSection } from "@/features/desktop/components/DrawerSection";
import { DisplaySection } from "@/features/desktop/components/DisplaySection";
import { desktop, isDesktop, useDeviceStore, type UpdateStatus } from "@/features/desktop/bridge";
import { catalogSavedAt } from "@/features/pos/catalog";
import { isWorkingOffline, useOfflineStore } from "@/features/pos/offline-store";
import { retryFailed, syncOutbox } from "@/features/pos/sync";
import { listOutbox } from "@/lib/offline-db";
import { ApiError } from "@/lib/api-client";
import { LanguagePicker } from "@/components/layout/LanguagePicker";
import { currentLanguage } from "@/i18n";

function formatTime(iso: string | null | undefined, t: TFunction<"device">) {
  if (!iso) return t("never");
  return new Date(iso).toLocaleString(currentLanguage(), { dateStyle: "medium", timeStyle: "short" });
}

/** Label/value line, the shape every section of this page uses. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

function TerminalSection() {
  const { t } = useTranslation("device");
  const terminal = useDeviceStore((s) => s.terminal);
  const setTerminal = useDeviceStore((s) => s.setTerminal);
  const role = useAuthStore((s) => s.user?.role);
  const stores = useAuthStore((s) => s.stores);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const canManage = role === "OWNER" || role === "MANAGER";
  const [name, setName] = React.useState("");
  const [storeId, setStoreId] = React.useState(currentStoreId ?? "");

  React.useEffect(() => {
    setName(terminal?.name ?? "");
  }, [terminal?.name]);

  const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : t("serverUnreachable"));

  const register = useMutation({
    mutationFn: () => createTerminal({ storeId, name: name.trim() }),
    onSuccess: async (created) => {
      await setTerminal({ id: created.id, name: created.name, code: created.code, storeId: created.storeId });
      toast.success(t("terminal.registered", { code: created.code, name: created.name }));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rename = useMutation({
    mutationFn: () => updateTerminal(terminal!.id, { name: name.trim() }),
    onSuccess: async (renamed) => {
      await setTerminal({ id: renamed.id, name: renamed.name, code: renamed.code, storeId: renamed.storeId });
      toast.success(t("terminal.renamed"));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? t("terminal.unknownStore");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("terminal.title")}</CardTitle>
        <CardDescription>{t("terminal.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {terminal ? (
          <div>
            <Row label={t("terminal.name")}>{terminal.name}</Row>
            <Row label={t("terminal.id")}>{terminal.code}</Row>
            <Row label={t("terminal.store")}>{storeName(terminal.storeId)}</Row>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("terminal.notRegistered")}</p>
        )}

        {canManage ? (
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              if (terminal) rename.mutate();
              else register.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="terminal-name">{t("terminal.tillName")}</Label>
              <Input
                id="terminal-name"
                placeholder={t("terminal.placeholder")}
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {!terminal && (
              <div className="space-y-1.5">
                <Label>{t("terminal.store")}</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger aria-label={t("terminal.store")}>
                    <SelectValue placeholder={t("terminal.chooseStore")} />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              type="submit"
              disabled={!name.trim() || (!terminal && !storeId) || register.isPending || rename.isPending}
            >
              {terminal ? t("terminal.rename") : t("terminal.register")}
            </Button>
          </form>
        ) : (
          !terminal && <p className="text-sm text-muted-foreground">{t("terminal.askManager")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SyncSection() {
  const { t } = useTranslation(["device", "pos", "common"]);
  const internet = useOfflineStore((s) => s.internet);
  const server = useOfflineStore((s) => s.server);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const failedCount = useOfflineStore((s) => s.failedCount);
  const isSyncing = useOfflineStore((s) => s.isSyncing);
  const lastSyncAt = useOfflineStore((s) => s.lastSyncAt);
  const offline = isWorkingOffline({ internet, server });

  const serverUrl = useQuery({
    queryKey: ["desktop-settings"],
    queryFn: () => desktop!.settings.get(),
    enabled: isDesktop,
  }).data?.serverUrl;
  const catalogAt = useQuery({ queryKey: ["catalog-saved-at", lastSyncAt], queryFn: catalogSavedAt }).data;
  const failed = useQuery({
    queryKey: ["outbox-failed", failedCount, isSyncing],
    queryFn: () => listOutbox(["failed"]),
  }).data;

  async function runSync() {
    const result = await syncOutbox();
    if (result.interrupted) toast.error(t("pos:sync.unreachable"));
    else toast.success(result.synced > 0 ? t("pos:sync.synced", { count: result.synced }) : t("sync.allSynced"));
  }

  const serverStatus = !internet
    ? t("pos:sync.noInternet")
    : server === "down"
      ? t("sync.unreachable")
      : server === "up"
        ? t("sync.connected")
        : t("sync.checking");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sync.title")}</CardTitle>
        <CardDescription>{t("sync.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          {serverUrl && <Row label={t("sync.address")}>{serverUrl}</Row>}
          <Row label={t("sync.server")}>{serverStatus}</Row>
          <Row label={t("sync.mode")}>{offline ? t("pos:sync.offline") : t("sync.online")}</Row>
          <Row label={t("sync.pending")}>{pendingCount}</Row>
          <Row label={t("sync.failed")}>{failedCount}</Row>
          <Row label={t("sync.lastSync")}>{formatTime(lastSyncAt, t)}</Row>
          <Row label={t("sync.catalogSaved")}>{formatTime(catalogAt, t)}</Row>
        </div>
        <Button variant="outline" className="gap-2" onClick={runSync} disabled={isSyncing}>
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          {t("pos:sync.retry")}
        </Button>

        {failed && failed.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("sync.refused")}</p>
            <p className="text-sm text-muted-foreground">
              {t("sync.refusedHint")}
            </p>
            <ul className="divide-y rounded-md border">
              {failed.map((entry) => (
                <li key={entry.clientId} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{formatTime(entry.createdAt, t)}</p>
                    <p className="text-muted-foreground [overflow-wrap:anywhere]">{entry.lastError}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void retryFailed(entry.clientId)}>
                    {t("common:actions.retry")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function updateText(update: UpdateStatus | null, t: TFunction<"device">): string {
  switch (update?.state) {
    case undefined:
    case "idle":
      return t("updates.notChecked");
    case "disabled":
      return update.code ? t(`updates.codes.${update.code}`) : update.reason;
    case "checking":
      return t("sync.checking");
    case "up-to-date":
      return t("updates.upToDate");
    case "downloading":
      return t("updates.downloading", { version: update.version, percent: update.percent });
    case "ready":
      return t("updates.ready", { version: update.version });
    case "error":
      // "other" carries the updater's own (English) message.
      return update.code && update.code !== "other" ? t(`updates.codes.${update.code}`) : update.error;
  }
}

function DesktopSection() {
  const { t } = useTranslation("device");
  const info = useQuery({ queryKey: ["desktop-info"], queryFn: () => desktop!.app.info() }).data;
  const update = useDeviceStore((s) => s.update);
  const settingsQuery = useQuery({ queryKey: ["desktop-settings"], queryFn: () => desktop!.settings.get() });
  const settings = settingsQuery.data;

  async function toggle(key: "kiosk" | "startWithWindows", value: boolean) {
    await desktop!.settings.update({ [key]: value });
    await settingsQuery.refetch();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("app.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Row label={t("app.version")}>{info?.version ?? "…"}</Row>
          <Row label={t("updates.title")}>
            <span data-testid="update-status">{updateText(update, t)}</span>
          </Row>
        </div>
        <div className="flex flex-wrap gap-2">
          {update?.state === "ready" ? (
            <Button className="gap-2" onClick={() => void desktop!.updates.install()}>
              <Download className="h-4 w-4" /> {t("updates.installNow")}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="gap-2"
              disabled={update?.state === "disabled" || update?.state === "checking" || update?.state === "downloading"}
              onClick={() => void desktop!.updates.check()}
            >
              <RefreshCw className="h-4 w-4" /> {t("updates.check")}
            </Button>
          )}
        </div>
        {settings && (
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={settings.kiosk}
                onChange={(e) => void toggle("kiosk", e.target.checked)}
              />
              {t("app.kiosk")}
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={settings.startWithWindows}
                onChange={(e) => void toggle("startWithWindows", e.target.checked)}
              />
              {t("app.startWithWindows")}
            </label>
          </div>
        )}
        <Button variant="outline" className="gap-2" onClick={() => void desktop!.app.openLogFolder()}>
          <FolderOpen className="h-4 w-4" /> {t("app.openLogs")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** "This device": the till's identity, connection and sync health, and app settings. */
export function DevicePage() {
  const { t } = useTranslation(["device", "common"]);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("common:nav.thisDevice")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("common:language.label")}</CardTitle>
          <CardDescription>{t("languageHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguagePicker />
        </CardContent>
      </Card>
      {isDesktop && <TerminalSection />}
      <SyncSection />
      {isDesktop && <PrintersSection />}
      {isDesktop && <DrawerSection />}
      {isDesktop && <DisplaySection />}
      {isDesktop && <DesktopSection />}
    </div>
  );
}
