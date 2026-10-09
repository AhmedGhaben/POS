import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { desktop, useDeviceStore, type DisplaySettings } from "../bridge";

const BAUD_RATES = [2400, 4800, 9600, 19200, 38400, 57600, 115200];
const ANY_OTHER = "__other__";

/** Commits on blur/Enter, so typing doesn't save every keystroke. */
function TextField({
  id,
  label,
  value,
  placeholder,
  maxLength,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
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
        maxLength={maxLength}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onCommit(text.trim())}
        onKeyDown={(e) => e.key === "Enter" && text !== value && onCommit(text.trim())}
      />
    </div>
  );
}

/** Settings → This device → Customer display (Windows app only). */
export function DisplaySection() {
  const display = useDeviceStore((s) => s.display);
  const setDisplay = useDeviceStore((s) => s.setDisplay);
  const [testing, setTesting] = React.useState(false);
  const comPorts = useQuery({
    queryKey: ["desktop-com-ports"],
    queryFn: () => desktop!.hardware.comPorts(),
    enabled: display?.kind === "pole" && display.pole.connection === "serial",
  });
  const screens = useQuery({
    queryKey: ["desktop-screens"],
    queryFn: () => desktop!.display.screens(),
    enabled: display?.kind === "monitor",
  });

  if (!display) return null;

  async function save(next: DisplaySettings) {
    try {
      await setDisplay(next);
    } catch {
      toast.error("Couldn't save the display settings. Check the values.");
    }
  }
  const savePole = (patch: Partial<DisplaySettings["pole"]>) => save({ ...display, pole: { ...display.pole, ...patch } });

  async function test() {
    setTesting(true);
    const result = await desktop!.display.test();
    setTesting(false);
    if (result.ok) toast.success(display!.kind === "pole" ? "Sent a test line to the display" : "Customer screen opened");
    else toast.error(`Display test failed: ${result.error}`);
  }

  const onlyOneScreen = screens.data?.length === 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer display</CardTitle>
        <CardDescription>
          Shows the customer each item and the total while you ring up, then the change. Works offline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="display-kind">Display</Label>
          <Select value={display.kind} onValueChange={(v) => void save({ ...display, kind: v as DisplaySettings["kind"] })}>
            <SelectTrigger id="display-kind" aria-label="Customer display">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No customer display</SelectItem>
              <SelectItem value="pole">Pole display (2 lines × 20 characters)</SelectItem>
              <SelectItem value="monitor">Second monitor facing the customer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {display.kind === "pole" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pole-connection">Connection</Label>
              <Select
                value={display.pole.connection}
                onValueChange={(v) => void savePole({ connection: v as "serial" | "network" })}
              >
                <SelectTrigger id="pole-connection" aria-label="Display connection">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="serial">COM port (USB or serial)</SelectItem>
                  <SelectItem value="network">Network (IP address)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pole-commands">Command set</Label>
              <Select
                value={display.pole.commandSet}
                onValueChange={(v) => void savePole({ commandSet: v as DisplaySettings["pole"]["commandSet"] })}
              >
                <SelectTrigger id="pole-commands" aria-label="Command set">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="epson">Epson / ESC-POS (most)</SelectItem>
                  <SelectItem value="cd5220">CD5220</SelectItem>
                  <SelectItem value="plain">Plain text</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {display.pole.connection === "serial" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="pole-com">COM port</Label>
                  <Select value={display.pole.comPort ?? ""} onValueChange={(v) => void savePole({ comPort: v })}>
                    <SelectTrigger id="pole-com" aria-label="Display COM port">
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
                  <Label htmlFor="pole-baud">Speed (baud)</Label>
                  <Select value={String(display.pole.baudRate)} onValueChange={(v) => void savePole({ baudRate: Number(v) })}>
                    <SelectTrigger id="pole-baud" aria-label="Display baud rate">
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
              </>
            ) : (
              <>
                <TextField
                  id="pole-host"
                  label="Display IP address"
                  placeholder="192.168.1.60"
                  value={display.pole.host ?? ""}
                  onCommit={(host) => void savePole({ host: host || null })}
                />
                <TextField
                  id="pole-port"
                  label="Display port"
                  value={String(display.pole.port)}
                  onCommit={(v) => {
                    const port = Number(v);
                    if (Number.isInteger(port) && port > 0 && port < 65536) void savePole({ port });
                    else toast.error("Port must be a number from 1 to 65535");
                  }}
                />
              </>
            )}
          </div>
        )}

        {display.kind === "monitor" && (
          <div className="space-y-1.5">
            <Label htmlFor="monitor-screen">Screen</Label>
            <Select
              value={display.monitor.displayId === null ? ANY_OTHER : String(display.monitor.displayId)}
              onValueChange={(v) =>
                void save({ ...display, monitor: { displayId: v === ANY_OTHER ? null : Number(v) } })
              }
            >
              <SelectTrigger id="monitor-screen" aria-label="Customer screen">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_OTHER}>The screen that isn't the till's</SelectItem>
                {(screens.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.label} ({s.width}×{s.height}){s.primary ? " · main screen" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {onlyOneScreen && (
              <p className="text-sm text-muted-foreground">
                Only one screen is connected: the customer view opens as a window you can move once a second
                screen is plugged in.
              </p>
            )}
          </div>
        )}

        {display.kind !== "none" && (
          <>
            <TextField
              id="display-idle"
              label="Welcome message"
              placeholder="Welcome"
              maxLength={40}
              value={display.idleMessage}
              onCommit={(idleMessage) => void save({ ...display, idleMessage })}
            />
            <Button variant="outline" className="gap-2" disabled={testing} onClick={() => void test()}>
              <MonitorSmartphone className="h-4 w-4" /> Test display
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
