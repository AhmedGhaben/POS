import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/store";
import { createTerminal, updateTerminal } from "@/features/desktop/api";
import { desktop, isDesktop, useDeviceStore } from "@/features/desktop/bridge";
import { catalogSavedAt } from "@/features/pos/catalog";
import { isWorkingOffline, useOfflineStore } from "@/features/pos/offline-store";
import { retryFailed, syncOutbox } from "@/features/pos/sync";
import { listOutbox } from "@/lib/offline-db";
import { ApiError } from "@/lib/api-client";

function formatTime(iso: string | null | undefined) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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

  const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : "Couldn't reach the server");

  const register = useMutation({
    mutationFn: () => createTerminal({ storeId, name: name.trim() }),
    onSuccess: async (t) => {
      await setTerminal({ id: t.id, name: t.name, code: t.code, storeId: t.storeId });
      toast.success(`This till is now ${t.code} "${t.name}"`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rename = useMutation({
    mutationFn: () => updateTerminal(terminal!.id, { name: name.trim() }),
    onSuccess: async (t) => {
      await setTerminal({ id: t.id, name: t.name, code: t.code, storeId: t.storeId });
      toast.success("Till renamed");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "Unknown store";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Terminal</CardTitle>
        <CardDescription>
          Names this till so sales and cash-drawer events show where they happened.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {terminal ? (
          <div>
            <Row label="Name">{terminal.name}</Row>
            <Row label="Terminal ID">{terminal.code}</Row>
            <Row label="Store">{storeName(terminal.storeId)}</Row>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This till isn't registered yet.</p>
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
              <Label htmlFor="terminal-name">Till name</Label>
              <Input
                id="terminal-name"
                placeholder="Front Till"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {!terminal && (
              <div className="space-y-1.5">
                <Label>Store</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger aria-label="Store">
                    <SelectValue placeholder="Choose a store" />
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
              {terminal ? "Rename" : "Register this till"}
            </Button>
          </form>
        ) : (
          !terminal && <p className="text-sm text-muted-foreground">Ask a manager to register it.</p>
        )}
      </CardContent>
    </Card>
  );
}

function SyncSection() {
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
    if (result.interrupted) toast.error("Couldn't reach the server — will keep trying");
    else toast.success(result.synced > 0 ? `Synced ${result.synced}` : "All sales synced");
  }

  const serverStatus = !internet
    ? "No internet connection"
    : server === "down"
      ? "Unreachable"
      : server === "up"
        ? "Connected"
        : "Checking…";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server and sync</CardTitle>
        <CardDescription>
          Sales made while the server is unreachable are kept on this computer and uploaded automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          {serverUrl && <Row label="Address">{serverUrl}</Row>}
          <Row label="Server">{serverStatus}</Row>
          <Row label="POS mode">{offline ? "Working offline" : "Online"}</Row>
          <Row label="Sales waiting to sync">{pendingCount}</Row>
          <Row label="Failed to sync">{failedCount}</Row>
          <Row label="Last successful sync">{formatTime(lastSyncAt)}</Row>
          <Row label="Products saved for offline">{formatTime(catalogAt)}</Row>
        </div>
        <Button variant="outline" className="gap-2" onClick={runSync} disabled={isSyncing}>
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          Retry sync
        </Button>

        {failed && failed.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Sales the server refused</p>
            <p className="text-sm text-muted-foreground">
              Kept here until they're fixed and retried. Nothing is deleted.
            </p>
            <ul className="divide-y rounded-md border">
              {failed.map((entry) => (
                <li key={entry.clientId} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{formatTime(entry.createdAt)}</p>
                    <p className="text-muted-foreground [overflow-wrap:anywhere]">{entry.lastError}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void retryFailed(entry.clientId)}>
                    Retry
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

function DesktopSection() {
  const info = useQuery({ queryKey: ["desktop-info"], queryFn: () => desktop!.app.info() }).data;
  const settingsQuery = useQuery({ queryKey: ["desktop-settings"], queryFn: () => desktop!.settings.get() });
  const settings = settingsQuery.data;

  async function toggle(key: "kiosk" | "startWithWindows", value: boolean) {
    await desktop!.settings.update({ [key]: value });
    await settingsQuery.refetch();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Windows app</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Row label="Desktop version">{info?.version ?? "…"}</Row>
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
              Fullscreen till mode
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={settings.startWithWindows}
                onChange={(e) => void toggle("startWithWindows", e.target.checked)}
              />
              Start with Windows
            </label>
          </div>
        )}
        <Button variant="outline" className="gap-2" onClick={() => void desktop!.app.openLogFolder()}>
          <FolderOpen className="h-4 w-4" /> Open log folder
        </Button>
      </CardContent>
    </Card>
  );
}

/** "This device": the till's identity, connection and sync health, and app settings. */
export function DevicePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">This device</h1>
        <p className="text-sm text-muted-foreground">Settings and status for this computer only.</p>
      </div>
      {isDesktop && <TerminalSection />}
      <SyncSection />
      {isDesktop && <DesktopSection />}
    </div>
  );
}
