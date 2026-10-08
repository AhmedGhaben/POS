import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthStore } from "@/features/auth/store";
import { fetchProducts, IMPORT_CHUNK_SIZE, importProducts } from "@/features/products/api";
import { buildPreview, mapColumns, TEMPLATE_HEADERS, type ImportField, type PreviewRow } from "@/features/products/import-rows";
import { downloadCsv } from "@/lib/csv";
import { parseCsv } from "@/lib/csv-parse";

type Step =
  | { kind: "choose"; error: string | null }
  | { kind: "preview"; fileName: string; rows: PreviewRow[]; hasStock: boolean }
  | { kind: "importing"; done: number; total: number }
  | { kind: "done"; created: number; updated: number; skipped: { line: number; sku: string; reason: string }[] };

/** Rows shown in the preview table; the counts above it cover the whole file. */
const PREVIEW_LIMIT = 300;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const STATUS_BADGE: Record<PreviewRow["status"], { label: string; variant: "default" | "secondary" | "destructive" }> = {
  new: { label: "New", variant: "default" },
  update: { label: "Update", variant: "secondary" },
  error: { label: "Error", variant: "destructive" },
};

function downloadTemplate() {
  const fields = Object.keys(TEMPLATE_HEADERS) as ImportField[];
  const example: Record<ImportField, string> = {
    name: "Green tea 250g",
    sku: "TEA-250",
    barcode: "5012345678900",
    category: "Drinks",
    costPrice: "2.10",
    sellPrice: "4.50",
    taxRate: "10",
    stock: "24",
  };
  downloadCsv(
    "products-template.csv",
    fields.map((f) => ({ header: TEMPLATE_HEADERS[f], value: (row: Record<ImportField, string>) => row[f] })),
    [example],
  );
}

export function ImportProductsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const stores = useAuthStore((s) => s.stores);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const [step, setStep] = React.useState<Step>({ kind: "choose", error: null });
  const [updateExisting, setUpdateExisting] = React.useState(true);
  const [createCategories, setCreateCategories] = React.useState(true);
  const [storeId, setStoreId] = React.useState(currentStoreId ?? "");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setStep({ kind: "choose", error: null });
      setStoreId(currentStoreId ?? "");
    }
  }, [open, currentStoreId]);

  async function readFile(file: File) {
    if (file.size > MAX_FILE_BYTES) return setStep({ kind: "choose", error: "That file is over 5 MB." });
    const { rows } = parseCsv(await file.text());
    if (rows.length < 2) return setStep({ kind: "choose", error: "The file has no product rows under the header." });
    const { columns, missing } = mapColumns(rows[0]);
    if (missing.length > 0) {
      return setStep({
        kind: "choose",
        error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template to see the expected headers.`,
      });
    }
    const existing = await queryClient.fetchQuery({ queryKey: ["products", ""], queryFn: () => fetchProducts() });
    const preview = buildPreview(rows.slice(1), columns, new Set(existing.map((p) => p.sku)));
    setStep({ kind: "preview", fileName: file.name, rows: preview, hasStock: columns.stock !== undefined });
  }

  async function runImport(rows: PreviewRow[], hasStock: boolean) {
    const errorRows = rows.filter((r) => r.status === "error");
    const toSend = rows.filter((r) => r.status === "new" || (r.status === "update" && updateExisting));
    const notUpdated = rows.filter((r) => r.status === "update" && !updateExisting);
    const result = {
      created: 0,
      updated: 0,
      skipped: [
        ...errorRows.map((r) => ({ line: r.line, sku: r.sku, reason: r.errors.join("; ") })),
        ...notUpdated.map((r) => ({ line: r.line, sku: r.sku, reason: "SKU already exists (updating is off)" })),
      ],
    };
    setStep({ kind: "importing", done: 0, total: toSend.length });
    try {
      for (let i = 0; i < toSend.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = toSend.slice(i, i + IMPORT_CHUNK_SIZE);
        const res = await importProducts({
          rows: chunk.map((r) => r.payload!),
          updateExisting,
          createCategories,
          storeId: hasStock ? storeId : undefined,
        });
        result.created += res.created;
        result.updated += res.updated;
        result.skipped.push(...res.skipped);
        setStep({ kind: "importing", done: i + chunk.length, total: toSend.length });
      }
    } catch (err) {
      // Earlier chunks are already saved; say so rather than implying nothing happened.
      toast.error(`Import stopped: ${(err as Error).message}`);
    }
    result.skipped.sort((a, b) => a.line - b.line);
    setStep({ kind: "done", ...result });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => step.kind !== "importing" && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import products from CSV</DialogTitle>
          <DialogDescription>
            Products are matched by SKU. Nothing is saved until you confirm the preview.
          </DialogDescription>
        </DialogHeader>

        {step.kind === "choose" && (
          <div className="space-y-4">
            <div className="rounded-md border border-dashed p-6 text-center">
              <FileUp className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="mb-3 text-sm text-muted-foreground">
                A .csv file with a header row. Required columns: Name, SKU, Sell price. Optional: Barcode, Category, Cost
                price, Tax %, Stock. Excel files: use File → Save As → CSV.
              </p>
              <Button onClick={() => inputRef.current?.click()}>Choose file</Button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void readFile(file);
                }}
              />
            </div>
            {step.error && <p className="text-sm text-destructive">{step.error}</p>}
            <Button variant="link" className="h-auto p-0" onClick={downloadTemplate}>
              <Download className="mr-1 h-4 w-4" /> Download template
            </Button>
          </div>
        )}

        {step.kind === "preview" && (
          <PreviewStep
            step={step}
            updateExisting={updateExisting}
            setUpdateExisting={setUpdateExisting}
            createCategories={createCategories}
            setCreateCategories={setCreateCategories}
            storeId={storeId}
            setStoreId={setStoreId}
            stores={stores}
            onBack={() => setStep({ kind: "choose", error: null })}
            onImport={() => runImport(step.rows, step.hasStock)}
          />
        )}

        {step.kind === "importing" && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Importing… {step.done} of {step.total} rows
          </p>
        )}

        {step.kind === "done" && (
          <div className="space-y-4">
            <p className="text-sm">
              <span className="font-semibold">{step.created}</span> created,{" "}
              <span className="font-semibold">{step.updated}</span> updated,{" "}
              <span className="font-semibold">{step.skipped.length}</span> skipped.
            </p>
            {step.skipped.length > 0 && (
              <>
                <div className="max-h-56 overflow-auto rounded-md border text-sm">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Line</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {step.skipped.map((s) => (
                        <TableRow key={`${s.line}-${s.sku}`}>
                          <TableCell>{s.line}</TableCell>
                          <TableCell>{s.sku || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{s.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadCsv(
                      "skipped-rows.csv",
                      [
                        { header: "Line", value: (s: { line: number }) => s.line },
                        { header: "SKU", value: (s: { sku: string }) => s.sku },
                        { header: "Reason", value: (s: { reason: string }) => s.reason },
                      ],
                      step.skipped,
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" /> Download skipped rows
                </Button>
              </>
            )}
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface PreviewStepProps {
  step: Extract<Step, { kind: "preview" }>;
  updateExisting: boolean;
  setUpdateExisting: (v: boolean) => void;
  createCategories: boolean;
  setCreateCategories: (v: boolean) => void;
  storeId: string;
  setStoreId: (v: string) => void;
  stores: { id: string; name: string }[];
  onBack: () => void;
  onImport: () => void;
}

function PreviewStep(props: PreviewStepProps) {
  const { step, updateExisting, createCategories, storeId, stores } = props;
  const counts = { new: 0, update: 0, error: 0 };
  for (const row of step.rows) counts[row.status]++;
  const importable = counts.new + (updateExisting ? counts.update : 0);
  const needsStore = step.hasStock && !storeId;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-medium">{step.fileName}</span>: {counts.new} new, {counts.update} matching existing SKUs,{" "}
        <span className={counts.error > 0 ? "font-medium text-destructive" : undefined}>
          {counts.error} with errors
        </span>
        .
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={updateExisting}
            onChange={(e) => props.setUpdateExisting(e.target.checked)}
          />
          <span>
            Update existing products with a matching SKU
            <span className="block text-xs text-muted-foreground">Columns left blank keep their current values.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={createCategories}
            onChange={(e) => props.setCreateCategories(e.target.checked)}
          />
          <span>
            Create missing categories
            <span className="block text-xs text-muted-foreground">Otherwise rows with an unknown category are skipped.</span>
          </span>
        </label>
        {step.hasStock && (
          <div className="space-y-1 sm:col-span-2">
            <Label>Stock column sets the quantity at</Label>
            <Select value={storeId} onValueChange={props.setStoreId}>
              <SelectTrigger className="sm:w-72">
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
      </div>

      <div className="max-h-[40vh] overflow-auto rounded-md border text-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Line</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Sell price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {step.rows.slice(0, PREVIEW_LIMIT).map((row) => (
              <TableRow key={row.line} className={row.status === "error" ? "bg-destructive/5" : undefined}>
                <TableCell>{row.line}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[row.status].variant}>{STATUS_BADGE[row.status].label}</Badge>
                </TableCell>
                <TableCell>{row.sku || "—"}</TableCell>
                <TableCell>
                  {row.name || "—"}
                  {row.errors.length > 0 && <span className="block text-xs text-destructive">{row.errors.join("; ")}</span>}
                </TableCell>
                <TableCell className="text-right">{row.sellPrice}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {step.rows.length > PREVIEW_LIMIT && (
          <p className="p-2 text-center text-xs text-muted-foreground">
            Showing the first {PREVIEW_LIMIT} of {step.rows.length} rows; all of them will be imported.
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={props.onBack}>
          Choose another file
        </Button>
        <Button disabled={importable === 0 || needsStore} onClick={props.onImport}>
          Import {importable} product{importable === 1 ? "" : "s"}
        </Button>
      </div>
      {counts.error > 0 && (
        <p className="text-right text-xs text-muted-foreground">Rows with errors are skipped and listed afterwards.</p>
      )}
    </div>
  );
}
