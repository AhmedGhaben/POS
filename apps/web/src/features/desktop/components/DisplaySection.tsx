import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MonitorSmartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("device");
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
      toast.error(t("display.saveFailed"));
    }
  }
  const savePole = (patch: Partial<DisplaySettings["pole"]>) => save({ ...display, pole: { ...display.pole, ...patch } });

  async function test() {
    setTesting(true);
    const result = await desktop!.display.test();
    setTesting(false);
    if (result.ok) toast.success(display!.kind === "pole" ? t("display.testSent") : t("display.screenOpened"));
    else toast.error(t("display.testFailed", { error: result.error }));
  }

  const onlyOneScreen = screens.data?.length === 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("display.title")}</CardTitle>
        <CardDescription>{t("display.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="display-kind">{t("display.kind")}</Label>
          <Select value={display.kind} onValueChange={(v) => void save({ ...display, kind: v as DisplaySettings["kind"] })}>
            <SelectTrigger id="display-kind" aria-label={t("display.title")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("display.kinds.none")}</SelectItem>
              <SelectItem value="pole">{t("display.kinds.pole")}</SelectItem>
              <SelectItem value="monitor">{t("display.kinds.monitor")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {display.kind === "pole" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pole-connection">{t("drawer.connection")}</Label>
              <Select
                value={display.pole.connection}
                onValueChange={(v) => void savePole({ connection: v as "serial" | "network" })}
              >
                <SelectTrigger id="pole-connection" aria-label={t("display.connectionLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="serial">{t("display.serial")}</SelectItem>
                  <SelectItem value="network">{t("display.network")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pole-commands">{t("display.commandSet")}</Label>
              <Select
                value={display.pole.commandSet}
                onValueChange={(v) => void savePole({ commandSet: v as DisplaySettings["pole"]["commandSet"] })}
              >
                <SelectTrigger id="pole-commands" aria-label={t("display.commandSet")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="epson">{t("display.epson")}</SelectItem>
                  <SelectItem value="cd5220">CD5220</SelectItem>
                  <SelectItem value="plain">{t("display.plain")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {display.pole.connection === "serial" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="pole-com">{t("drawer.comPort")}</Label>
                  <Select value={display.pole.comPort ?? ""} onValueChange={(v) => void savePole({ comPort: v })}>
                    <SelectTrigger id="pole-com" aria-label={t("display.comPortLabel")}>
                      <SelectValue placeholder={comPorts.data?.length === 0 ? t("drawer.noComPorts") : t("drawer.choosePort")} />
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
                  <Label htmlFor="pole-baud">{t("drawer.baud")}</Label>
                  <Select value={String(display.pole.baudRate)} onValueChange={(v) => void savePole({ baudRate: Number(v) })}>
                    <SelectTrigger id="pole-baud" aria-label={t("display.baudLabel")}>
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
                  label={t("display.ip")}
                  placeholder="192.168.1.60"
                  value={display.pole.host ?? ""}
                  onCommit={(host) => void savePole({ host: host || null })}
                />
                <TextField
                  id="pole-port"
                  label={t("display.port")}
                  value={String(display.pole.port)}
                  onCommit={(v) => {
                    const port = Number(v);
                    if (Number.isInteger(port) && port > 0 && port < 65536) void savePole({ port });
                    else toast.error(t("drawer.badPort"));
                  }}
                />
              </>
            )}
          </div>
        )}

        {display.kind === "monitor" && (
          <div className="space-y-1.5">
            <Label htmlFor="monitor-screen">{t("display.screen")}</Label>
            <Select
              value={display.monitor.displayId === null ? ANY_OTHER : String(display.monitor.displayId)}
              onValueChange={(v) =>
                void save({ ...display, monitor: { displayId: v === ANY_OTHER ? null : Number(v) } })
              }
            >
              <SelectTrigger id="monitor-screen" aria-label={t("display.screenLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_OTHER}>{t("display.otherScreen")}</SelectItem>
                {(screens.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.label} ({s.width}×{s.height}){s.primary ? ` · ${t("display.mainScreen")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {onlyOneScreen && (
              <p className="text-sm text-muted-foreground">
                {t("display.oneScreen")}
              </p>
            )}
          </div>
        )}

        {display.kind !== "none" && (
          <>
            <TextField
              id="display-idle"
              label={t("display.welcomeMessage")}
              placeholder={t("display.welcomePlaceholder")}
              maxLength={40}
              value={display.idleMessage}
              onCommit={(idleMessage) => void save({ ...display, idleMessage })}
            />
            <Button variant="outline" className="gap-2" disabled={testing} onClick={() => void test()}>
              <MonitorSmartphone className="h-4 w-4" /> {t("display.test")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
