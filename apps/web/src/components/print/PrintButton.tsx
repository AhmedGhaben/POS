import * as React from "react";
import { Printer, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { desktop, type DesktopPrinter } from "@/features/desktop/bridge";

export interface PrintChoice {
  copies: number;
  /** Another printer for this print (Windows app); undefined = the till's. */
  deviceName?: string;
}

/**
 * Print, with "Print options" beside it for this one print: how many
 * copies and (in the Windows app) which printer. The till's own printers
 * and the store's copies stay the default.
 */
export function PrintButton({
  onPrint,
  defaultCopies = 1,
  label,
  disabled,
  className,
}: {
  onPrint: (choice: PrintChoice) => void | Promise<void>;
  defaultCopies?: number;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = React.useState(false);
  const [copies, setCopies] = React.useState(String(defaultCopies));
  const [deviceName, setDeviceName] = React.useState<string | null>(null);
  const [printers, setPrinters] = React.useState<DesktopPrinter[]>([]);
  React.useEffect(() => {
    if (!open) return;
    setCopies(String(defaultCopies));
    setDeviceName(null);
    void desktop?.printers.list().then(setPrinters).catch(() => setPrinters([]));
  }, [open, defaultCopies]);
  const n = Number(copies);
  const valid = Number.isInteger(n) && n >= 1 && n <= 5;

  return (
    <div className={`flex gap-1 ${className ?? ""}`}>
      <Button className="flex-1" disabled={disabled} onClick={() => void onPrint({ copies: defaultCopies })}>
        <Printer className="mr-2 h-4 w-4" aria-hidden /> {label ?? t("actions.print")}
      </Button>
      <Button variant="outline" size="icon" disabled={disabled} aria-label={t("print.options")} title={t("print.options")} onClick={() => setOpen(true)}>
        <Settings2 className="h-4 w-4" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("print.options")}</DialogTitle>
            <DialogDescription>{t("print.optionsDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              setOpen(false);
              void onPrint({ copies: n, deviceName: deviceName ?? undefined });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="print-copies">{t("print.copies")}</Label>
              <Input id="print-copies" type="number" min={1} max={5} step={1} value={copies} onChange={(e) => setCopies(e.target.value)} />
            </div>
            {desktop && (
              <div className="space-y-1.5">
                <Label htmlFor="print-printer">{t("print.printer")}</Label>
                <Combobox
                  id="print-printer"
                  value={deviceName}
                  onChange={setDeviceName}
                  placeholder={t("print.tillPrinter")}
                  clearLabel={t("print.tillPrinter")}
                  options={printers.map((p) => ({ value: p.name, label: p.displayName || p.name, description: p.isDefault ? t("print.windowsDefault") : undefined }))}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={!valid}>
              <Printer className="mr-2 h-4 w-4" aria-hidden /> {t("actions.print")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
