import * as React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguagePicker } from "@/components/layout/LanguagePicker";
import { pairTerminal } from "@/features/desktop/api";
import { isDesktop, useDeviceStore } from "@/features/desktop/bridge";
import { PrintersSection } from "@/features/desktop/components/PrintersSection";
import { DrawerSection } from "@/features/desktop/components/DrawerSection";
import { DisplaySection } from "@/features/desktop/components/DisplaySection";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const STEPS = ["till", "printer", "drawer", "display", "done"] as const;
type Step = (typeof STEPS)[number];

/**
 * First start on a new till (docs/plans/TILL_ESSENTIALS.md, part 5): enter
 * the till code from the back office, then the receipt printer, drawer and
 * customer display, each with its test. Can be run again from This device.
 */
export function SetupPage() {
  const { t } = useTranslation("device");
  const navigate = useNavigate();
  const terminal = useDeviceStore((s) => s.terminal);
  const loaded = useDeviceStore((s) => s.loaded);
  const [step, setStep] = React.useState<Step>("till");

  React.useEffect(() => {
    void useDeviceStore.getState().load();
  }, []);

  if (!isDesktop) return <Navigate to="/login" replace />;

  const index = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]);
  const back = () => setStep(STEPS[Math.max(index - 1, 0)]);

  return (
    <div className="relative min-h-screen bg-muted/40 p-4">
      <LanguagePicker className="absolute right-4 top-4 h-9 bg-background" />
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{t("setup.title")}</h1>
          <ol className="mt-4 flex flex-wrap gap-2 text-sm" aria-label={t("setup.steps")}>
            {STEPS.map((s, i) => (
              <li
                key={s}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-3 py-1",
                  i === index && "border-foreground font-medium",
                  i < index && "text-muted-foreground",
                )}
                aria-current={i === index ? "step" : undefined}
              >
                {i < index && <Check className="h-3.5 w-3.5" />}
                {t(`setup.step.${s}`)}
              </li>
            ))}
          </ol>
        </div>

        {step === "till" && (
          <TillStep
            registered={loaded && !!terminal}
            terminalLabel={terminal ? `${terminal.code} ${terminal.name}` : ""}
            onDone={next}
            onSkip={() => navigate("/login")}
          />
        )}
        {step === "printer" && <PrintersSection />}
        {step === "drawer" && <DrawerSection />}
        {step === "display" && <DisplaySection />}
        {step === "done" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("setup.doneTitle")}</CardTitle>
              <CardDescription>{t("setup.doneDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/login")}>{t("setup.finish")}</Button>
            </CardContent>
          </Card>
        )}

        {step !== "till" && step !== "done" && (
          <div className="flex justify-between">
            <Button variant="outline" onClick={back}>
              {t("setup.back")}
            </Button>
            <Button onClick={next}>{t("setup.next")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TillStep({
  registered,
  terminalLabel,
  onDone,
  onSkip,
}: {
  registered: boolean;
  terminalLabel: string;
  onDone: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation("device");
  const setTerminal = useDeviceStore((s) => s.setTerminal);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code) || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The Windows app keeps the key from this answer; the page never sees it.
      const created = await pairTerminal(code);
      await setTerminal({ id: created.id, name: created.name, code: created.code, storeId: created.storeId });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("serverUnreachable"));
    } finally {
      setBusy(false);
    }
  }

  if (registered) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("setup.registeredTitle")}</CardTitle>
          <CardDescription>{t("setup.registered", { till: terminalLabel })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onDone}>{t("setup.next")}</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("setup.codeTitle")}</CardTitle>
        <CardDescription>{t("setup.codeDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="till-code">{t("setup.code")}</Label>
            <Input
              id="till-code"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              className="w-40 text-center font-mono text-2xl tracking-[0.3em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
          </div>
          <Button type="submit" disabled={code.length !== 6 || busy}>
            {t("setup.connect")}
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="border-t pt-4 text-sm text-muted-foreground">
          <p>{t("setup.noCode")}</p>
          <Button variant="link" className="h-auto px-0" onClick={onSkip}>
            {t("setup.skip")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
