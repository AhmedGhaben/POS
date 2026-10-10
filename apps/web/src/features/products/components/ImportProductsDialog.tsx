import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trans, useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Download, FileUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthStore } from "@/features/auth/store";
import { fetchProducts, IMPORT_CHUNK_SIZE, importProducts } from "@/features/products/api";
import { buildPreview, fieldHeader, IMPORT_FIELDS, mapColumns, type ImportField, type PreviewRow } from "@/features/products/import-rows";
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

const STATUS_VARIANT: Record<PreviewRow["status"], "default" | "secondary" | "destructive"> = {
  new: "default",
  update: "secondary",
  error: "destructive",
};

function downloadTemplate() {
  const example: Record<ImportField, string> = {
    name: i18n.t("products:import.exampleName"),
    sku: "TEA-250",
    barcode: "5012345678900",
    category: i18n.t("products:import.exampleCategory"),
    costPrice: "2.10",
    sellPrice: "4.50",
    taxRate: "10",
    stock: "24",
  };
  downloadCsv(
    i18n.t("products:import.templateFile"),
    IMPORT_FIELDS.map((f) => ({ header: fieldHeader(f), value: (row: Record<ImportField, string>) => row[f] })),
    [example],
  );
}

export function ImportProductsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(["products", "common"]);
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
    if (file.size > MAX_FILE_BYTES) return setStep({ kind: "choose", error: t("import.tooBig") });
    const { rows } = parseCsv(await file.text());
    if (rows.length < 2) return setStep({ kind: "choose", error: t("import.noRows") });
    const { columns, missing } = mapColumns(rows[0]);
    if (missing.length > 0) {
      return setStep({
        kind: "choose",
        error: t("import.missingColumns", { count: missing.length, columns: missing.join(", ") }),
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
        ...notUpdated.map((r) => ({ line: r.line, sku: r.sku, reason: t("import.updatingOff") })),
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
      toast.error(t("import.stopped", { error: (err as Error).message }));
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
          <DialogTitle>{t("import.title")}</DialogTitle>
          <DialogDescription>
            {t("import.description")}
          </DialogDescription>
        </DialogHeader>

        {step.kind === "choose" && (
          <div className="space-y-4">
            <div className="rounded-md border border-dashed p-6 text-center">
              <FileUp className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="mb-3 text-sm text-muted-foreground">
                {t("import.fileHelp")}
              </p>
              <Button onClick={() => inputRef.current?.click()}>{t("import.chooseFile")}</Button>
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
              <Download className="mr-1 h-4 w-4" /> {t("import.downloadTemplate")}
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
            {t("import.importing", { done: step.done, total: step.total })}
          </p>
        )}

        {step.kind === "done" && (
          <div className="space-y-4">
            <p className="text-sm">
              <Trans
                t={t}
                i18nKey="import.result"
                values={{ created: step.created, updated: step.updated, skipped: step.skipped.length }}
                components={{ b: <span className="font-semibold" /> }}
              />
            </p>
            {step.skipped.length > 0 && (
              <>
                <div className="max-h-56 overflow-auto rounded-md border text-sm">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">{t("import.line")}</TableHead>
                        <TableHead>{t("columns.sku")}</TableHead>
                        <TableHead>{t("import.reason")}</TableHead>
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
                      t("import.skippedFile"),
                      [
                        { header: t("import.line"), value: (s: { line: number }) => s.line },
                        { header: t("columns.sku"), value: (s: { sku: string }) => s.sku },
                        { header: t("import.reason"), value: (s: { reason: string }) => s.reason },
                      ],
                      step.skipped,
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" /> {t("import.downloadSkipped")}
                </Button>
              </>
            )}
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              {t("import.done")}
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
  const { t } = useTranslation("products");
  const { step, updateExisting, createCategories, storeId, stores } = props;
  const counts = { new: 0, update: 0, error: 0 };
  for (const row of step.rows) counts[row.status]++;
  const importable = counts.new + (updateExisting ? counts.update : 0);
  const needsStore = step.hasStock && !storeId;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Trans
          t={t}
          i18nKey="import.summary"
          values={{ file: step.fileName, created: counts.new, updated: counts.update, errors: counts.error }}
          components={{ b: <span className="font-medium" />, err: <span className={counts.error > 0 ? "font-medium text-destructive" : undefined} /> }}
        />
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
            {t("import.updateExisting")}
            <span className="block text-xs text-muted-foreground">{t("import.updateExistingHint")}</span>
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
            {t("import.createCategories")}
            <span className="block text-xs text-muted-foreground">{t("import.createCategoriesHint")}</span>
          </span>
        </label>
        {step.hasStock && (
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("import.stockAt")}</Label>
            <Select value={storeId} onValueChange={props.setStoreId}>
              <SelectTrigger className="sm:w-72">
                <SelectValue placeholder={t("import.chooseStore")} />
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
              <TableHead className="w-14">{t("import.line")}</TableHead>
              <TableHead className="w-20">{t("import.status")}</TableHead>
              <TableHead>{t("columns.sku")}</TableHead>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead className="text-right">{t("columns.sellPrice")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {step.rows.slice(0, PREVIEW_LIMIT).map((row) => (
              <TableRow key={row.line} className={row.status === "error" ? "bg-destructive/5" : undefined}>
                <TableCell>{row.line}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[row.status]}>{t(`import.statuses.${row.status}`)}</Badge>
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
            {t("import.showingFirst", { shown: PREVIEW_LIMIT, total: step.rows.length })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={props.onBack}>
          {t("import.chooseAnother")}
        </Button>
        <Button disabled={importable === 0 || needsStore} onClick={props.onImport}>
          {t("import.submit", { count: importable })}
        </Button>
      </div>
      {counts.error > 0 && (
        <p className="text-right text-xs text-muted-foreground">{t("import.errorsSkipped")}</p>
      )}
    </div>
  );
}
