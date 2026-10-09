import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Vault } from "lucide-react";
import { DrawerOpenReason } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { desktop, useDeviceStore, type DrawerConnection, type DrawerSettings } from "../bridge";
import { openCashDrawer, useCanOpenDrawer } from "../drawer";

const CONNECTIONS: { value: DrawerConnection; label: string }[] = [
  { value: "none", label: "No cash drawer" },
  { value: "receipt-printer", label: "Plugged into the receipt printer" },
  { value: "windows-printer", label: "Plugged into another printer" },
  { value: "network", label: "Network printer (IP address)" },
  { value: "serial", label: "COM port (serial)" },
];
const BAUD_RATES = [2400, 4800, 9600, 19200, 38400, 57600, 115200];

/** Commits on blur/Enter, so typing an address doesn't save every keystroke. */
function TextField({
  id,
  label,
  value,
  placeholder,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onCommit(text.trim())}
        onKeyDown={(e) => e.key === "Enter" && text !== value && onCommit(text.trim())}
      />
    </div>
  );
}

/** Settings → This device → Cash drawer (Windows app only). */
export function DrawerSection() {
  const drawer = useDeviceStore((s) => s.drawer);
  const setDrawer = useDeviceStore((s) => s.setDrawer);
  const receiptPrinter = useDeviceStore((s) => s.printing?.receipt.deviceName ?? null);
  const canOpen = useCanOpenDrawer();
  const [testing, setTesting] = React.useState(false);
  const printers = useQuery({ queryKey: ["desktop-printers"], queryFn: () => desktop!.printers.list() }).data ?? [];
  const comPorts = useQuery({
    queryKey: ["desktop-com-ports"],
    queryFn: () => desktop!.hardware.comPorts(),
    enabled: drawer?.connection === "serial",
  });

  if (!drawer) return null;

  async function save(patch: Partial<DrawerSettings>) {
    try {
      await setDrawer({ ...drawer!, ...patch });
    } catch {
      toast.error("Couldn't save the drawer settings. Check the values.");
    }
  }

  async function test() {
    setTesting(true);
    const ok = await openCashDrawer({ reason: DrawerOpenReason.MANUAL_OPEN, subReason: "TEST" });
    setTesting(false);
    if (ok) toast.success("Drawer opened");
  }

  const c = drawer.connection;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash drawer</CardTitle>
        <CardDescription>
          Opens by itself for cash sales. Every opening is recorded with the person, the till and the reason, even
          offline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="drawer-connection">Connection</Label>
          <Select value={c} onValueChange={(v) => void save({ connection: v as DrawerConnection })}>
            <SelectTrigger id="drawer-connection" aria-label="Drawer connection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONNECTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {c === "receipt-printer" && (
            <p className="text-sm text-muted-foreground" data-testid="drawer-printer-note">
              {receiptPrinter ? `Receipt printer: ${receiptPrinter}` : "Choose a receipt printer under Printers first."}
            </p>
          )}
        </div>

        {c === "windows-printer" && (
          <div className="space-y-1.5">
            <Label htmlFor="drawer-printer">Printer</Label>
            <Select value={drawer.printerName ?? ""} onValueChange={(v) => void save({ printerName: v })}>
              <SelectTrigger id="drawer-printer" aria-label="Drawer printer">
                <SelectValue placeholder="Choose a printer" />
              </SelectTrigger>
              <SelectContent>
                {printers.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {c === "network" && (
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <TextField
              id="drawer-host"
              label="Printer IP address"
              placeholder="192.168.1.50"
              value={drawer.host ?? ""}
              onCommit={(host) => void save({ host: host || null })}
            />
            <TextField
              id="drawer-port"
              label="Port"
              value={String(drawer.port)}
              onCommit={(v) => {
                const port = Number(v);
                if (Number.isInteger(port) && port > 0 && port < 65536) void save({ port });
                else toast.error("Port must be a number from 1 to 65535");
              }}
            />
          </div>
        )}

        {c === "serial" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="drawer-com">COM port</Label>
              <Select value={drawer.comPort ?? ""} onValueChange={(v) => void save({ comPort: v })}>
                <SelectTrigger id="drawer-com" aria-label="COM port">
                  <SelectValue placeholder={comPorts.data?.length === 0 ? "No COM ports found" : "Choose a port"} />
                </SelectTrigger>
                <SelectContent>
                  {(comPorts.data ?? []).map((port) => (
                    <SelectItem key={port} value={port}>
                      {port}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="drawer-baud">Speed (baud)</Label>
              <Select value={String(drawer.baudRate)} onValueChange={(v) => void save({ baudRate: Number(v) })}>
                <SelectTrigger id="drawer-baud" aria-label="Baud rate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BAUD_RATES.map((b) => (
                    <SelectItem key={b} value={String(b)}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {c !== "none" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="drawer-pin">Drawer connector</Label>
                <Select value={String(drawer.pin)} onValueChange={(v) => void save({ pin: v === "5" ? 5 : 2 })}>
                  <SelectTrigger id="drawer-pin" aria-label="Drawer connector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">Pin 2 (most drawers)</SelectItem>
                    <SelectItem value="5">Pin 5 (second drawer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <TextField
                id="drawer-pulse"
                label="Pulse length (ms)"
                value={String(drawer.pulseMs)}
                onCommit={(v) => {
                  const ms = Number(v);
                  if (Number.isInteger(ms) && ms >= 50 && ms <= 500) void save({ pulseMs: ms });
                  else toast.error("Pulse length must be 50 to 500 ms");
                }}
              />
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={drawer.openOnCashSale}
                onChange={(e) => void save({ openOnCashSale: e.target.checked })}
              />
              Open automatically for cash sales
            </label>
            {canOpen ? (
              <Button variant="outline" className="gap-2" disabled={testing} onClick={() => void test()}>
                <Vault className="h-4 w-4" /> Test drawer
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Testing the drawer needs the "Open the cash drawer" permission.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
