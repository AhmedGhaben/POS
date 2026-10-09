import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrintArea } from "@/components/print/PrintArea";
import { desktop, useDeviceStore, type PrintingSettings, type ReceiptPrinterSettings } from "../bridge";
import { printDocument } from "../printing";

const NONE = "__none__";
/** Typical printable widths: the print head is narrower than the roll. */
const PRINTABLE_FOR_PAPER: Record<number, number> = { 58: 48, 80: 72 };

function PrinterSelect({
  id,
  value,
  printers,
  onChange,
}: {
  id: string;
  value: string | null;
  printers: { name: string; displayName: string; isDefault: boolean }[];
  onChange: (name: string | null) => void;
}) {
  const missing = value !== null && !printers.some((p) => p.name === value);
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id} aria-label={id === "receipt-printer" ? "Receipt printer" : "A4 printer"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None (show the print dialog)</SelectItem>
        {printers.map((p) => (
          <SelectItem key={p.name} value={p.name}>
            {p.displayName}
            {p.isDefault ? " (Windows default)" : ""}
          </SelectItem>
        ))}
        {missing && <SelectItem value={value}>{value} (not found)</SelectItem>}
      </SelectContent>
    </Select>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  suffix,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);
  function commit() {
    const n = Number(text.replace(",", "."));
    if (Number.isFinite(n) && n >= min && n <= max) onCommit(n);
    else setText(String(value));
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {suffix ? ` (${suffix})` : ""}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </div>
  );
}

/** Ruler, edge box and long lines: shows at a glance what the printer cuts off. */
function CalibrationReceipt({ printerName, r }: { printerName: string; r: ReceiptPrinterSettings }) {
  const marks = Array.from({ length: Math.floor(r.printableWidthMm / 10) + 1 }, (_, i) => i * 10);
  return (
    <div className="receipt-slip mx-auto w-[300px] font-mono text-xs">
      <p className="text-center font-bold">PRINTER CALIBRATION</p>
      <p className="text-center [overflow-wrap:anywhere]">{printerName}</p>
      <hr className="my-2 border-dashed border-black" />
      <p>
        Paper {r.paperWidthMm} mm · printable {r.printableWidthMm} mm · left margin {r.marginLeftMm} mm · text
        size {Math.round(r.fontScale * 100)}%
      </p>
      <div className="relative mt-2 h-6 border-x-2 border-b-2 border-black">
        {marks.map((mm) => (
          <span
            key={mm}
            className="absolute bottom-0 h-3 border-l border-black pl-0.5 text-[9px] leading-none"
            style={{ left: `${(mm / r.printableWidthMm) * 100}%` }}
          >
            {mm}
          </span>
        ))}
      </div>
      <div className="mt-2 border-2 border-black p-1 text-center font-bold">BOTH SIDES OF THIS BOX MUST PRINT</div>
      <p className="mt-2 break-all">{"1234567890".repeat(8)}</p>
      <p className="mt-2">Right side cut off: lower "Printable width".</p>
      <p>Empty space on the right: raise it.</p>
      <p>Everything shifted: change "Left margin".</p>
      <p className="mt-2 text-center">*** END ***</p>
    </div>
  );
}

function A4TestPage({ printerName }: { printerName: string }) {
  return (
    <div className="a4-doc mx-auto w-[210mm] bg-white p-[15mm] text-sm text-black">
      <h1 className="text-2xl font-bold">A4 test page</h1>
      <p className="mt-1">{printerName}</p>
      <p>{new Date().toLocaleString()}</p>
      <div className="mt-6 border-2 border-black p-4">
        This box spans the full printable width. If all four sides print with a margin of about 15 mm around the
        page, invoices and A4 quotations will print correctly on this printer.
      </div>
    </div>
  );
}

/** Settings → This device → Printers (Windows app only). */
export function PrintersSection() {
  const printing = useDeviceStore((s) => s.printing);
  const setPrinting = useDeviceStore((s) => s.setPrinting);
  const printersQuery = useQuery({ queryKey: ["desktop-printers"], queryFn: () => desktop!.printers.list() });
  const printers = printersQuery.data ?? [];
  const [test, setTest] = React.useState<"receipt" | "a4" | null>(null);

  // A test document is rendered into the print area, then printed once.
  React.useEffect(() => {
    if (!test) return;
    const frame = requestAnimationFrame(() => {
      void printDocument({ copies: 1 }).finally(() => setTest(null));
    });
    return () => cancelAnimationFrame(frame);
  }, [test]);

  if (!printing) return null;

  async function save(next: PrintingSettings) {
    try {
      await setPrinting(next);
    } catch {
      toast.error("Couldn't save the printer settings");
    }
  }
  const r = printing.receipt;
  const updateReceipt = (patch: Partial<ReceiptPrinterSettings>) => save({ ...printing, receipt: { ...r, ...patch } });
  const paperPreset = r.paperWidthMm === 58 || r.paperWidthMm === 80 ? String(r.paperWidthMm) : "custom";
  const status = (name: string | null) =>
    !name ? "Not set" : printers.some((p) => p.name === name) ? "Available" : printersQuery.isLoading ? "…" : "Not found";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Printers</CardTitle>
        <CardDescription>
          Receipts and invoices print straight to these printers, without a dialog. Works offline too.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Receipt printer</h3>
            <span className="text-sm text-muted-foreground" data-testid="receipt-printer-status">
              {status(r.deviceName)}
            </span>
          </div>
          <PrinterSelect
            id="receipt-printer"
            value={r.deviceName}
            printers={printers}
            onChange={(deviceName) => void updateReceipt({ deviceName })}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="paper-width">Paper width</Label>
              <Select
                value={paperPreset}
                onValueChange={(v) => {
                  if (v === "custom") return void updateReceipt({ paperWidthMm: 76 });
                  const mm = Number(v);
                  void updateReceipt({ paperWidthMm: mm, printableWidthMm: PRINTABLE_FOR_PAPER[mm] });
                }}
              >
                <SelectTrigger id="paper-width" aria-label="Paper width">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="80">80 mm</SelectItem>
                  <SelectItem value="58">58 mm</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paperPreset === "custom" && (
              <NumberField
                id="paper-width-custom"
                label="Custom paper width"
                suffix="mm"
                value={r.paperWidthMm}
                min={40}
                max={120}
                onCommit={(paperWidthMm) => void updateReceipt({ paperWidthMm })}
              />
            )}
            <NumberField
              id="printable-width"
              label="Printable width"
              suffix="mm"
              value={r.printableWidthMm}
              min={30}
              max={r.paperWidthMm}
              onCommit={(printableWidthMm) => void updateReceipt({ printableWidthMm })}
            />
            <NumberField
              id="margin-left"
              label="Left margin"
              suffix="mm"
              value={r.marginLeftMm}
              min={0}
              max={20}
              onCommit={(marginLeftMm) => void updateReceipt({ marginLeftMm })}
            />
            <NumberField
              id="font-scale"
              label="Text size"
              suffix="%"
              value={Math.round(r.fontScale * 100)}
              min={50}
              max={150}
              onCommit={(pct) => void updateReceipt({ fontScale: pct / 100 })}
            />
            <NumberField
              id="feed"
              label="Paper after receipt"
              suffix="mm"
              value={r.feedMm}
              min={0}
              max={40}
              onCommit={(feedMm) => void updateReceipt({ feedMm })}
            />
            <NumberField
              id="receipt-copies"
              label="Copies"
              value={r.copies}
              min={1}
              max={5}
              onCommit={(copies) => void updateReceipt({ copies })}
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={printing.autoPrintReceipt}
              onChange={(e) => void save({ ...printing, autoPrintReceipt: e.target.checked })}
            />
            Print the receipt automatically after each sale
          </label>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!r.deviceName || test !== null}
            onClick={() => setTest("receipt")}
          >
            <Printer className="h-4 w-4" /> Print calibration receipt
          </Button>
        </section>

        <section className="space-y-3 border-t pt-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">A4 printer</h3>
            <span className="text-sm text-muted-foreground">{status(printing.a4.deviceName)}</span>
          </div>
          <p className="text-sm text-muted-foreground">For invoices and A4 quotations.</p>
          <PrinterSelect
            id="a4-printer"
            value={printing.a4.deviceName}
            printers={printers}
            onChange={(deviceName) => void save({ ...printing, a4: { ...printing.a4, deviceName } })}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField
              id="a4-copies"
              label="Copies"
              value={printing.a4.copies}
              min={1}
              max={5}
              onCommit={(copies) => void save({ ...printing, a4: { ...printing.a4, copies } })}
            />
          </div>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!printing.a4.deviceName || test !== null}
            onClick={() => setTest("a4")}
          >
            <Printer className="h-4 w-4" /> Print A4 test page
          </Button>
        </section>

        <Button variant="ghost" size="sm" className="gap-2" onClick={() => void printersQuery.refetch()}>
          <RefreshCw className="h-4 w-4" /> Refresh printer list
        </Button>

        {test === "receipt" && (
          <PrintArea format="receipt">
            <CalibrationReceipt printerName={r.deviceName ?? ""} r={r} />
          </PrintArea>
        )}
        {test === "a4" && (
          <PrintArea format="a4">
            <A4TestPage printerName={printing.a4.deviceName ?? ""} />
          </PrintArea>
        )}
      </CardContent>
    </Card>
  );
}
