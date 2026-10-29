import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { InventoryItemDto, StockCountPreviewRowDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createStockCount, previewStockCount } from "../api";
import { draftCountRows, type CountEdits } from "../count-draft";

export function StockCountActions({ storeId, items, edits, onSaved, disabled }: {
  storeId: string; items: InventoryItemDto[]; edits: CountEdits; onSaved: () => void; disabled: boolean;
}) {
  const { t } = useTranslation(["stock", "common"]);
  const client = useQueryClient();
  const [rows, setRows] = React.useState<StockCountPreviewRowDto[] | null>(null);
  const [note, setNote] = React.useState("");
  const [reading, setReading] = React.useState(false);
  const [stale, setStale] = React.useState(false);
  const save = useMutation({
    mutationFn: () => createStockCount(storeId, { note, lines: rows!.map((r) => ({ productId: r.productId!, quantity: r.quantity!, expectedQuantity: Number(r.currentQuantity) })) }),
    onSuccess: ({ changed }) => {
      void client.invalidateQueries({ queryKey: ["inventory", storeId] });
      void client.invalidateQueries({ queryKey: ["stock-movements", storeId] });
      void client.invalidateQueries({ queryKey: ["stock-at", storeId] });
      onSaved(); setRows(null); setNote("");
      toast.success(t("count.saved", { count: changed }));
    },
    onError: (error) => { setStale(true); toast.error((error as Error).message); },
  });
  async function importFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error(t("count.fileTooLarge")); return; }
    setReading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(t("count.unreadable")));
        reader.readAsDataURL(file);
      });
      const preview = await previewStockCount(storeId, file.name, dataUrl);
      setStale(false); setRows(preview.rows);
    } catch (error) { toast.error((error as Error).message); }
    finally { setReading(false); }
  }
  const busy = disabled || reading || save.isPending;
  return (
    <>
      <Button disabled={busy || !Object.keys(edits).length} onClick={() => { setStale(false); setRows(draftCountRows(items, edits)); }}>
        {t("count.saveAll", { count: Object.keys(edits).length })}
      </Button>
      <Button variant="outline" disabled={busy || !Object.keys(edits).length} onClick={onSaved}>{t("count.discard")}</Button>
      <label className="inline-flex items-center gap-2 text-sm">
        {t("count.import")}
        <Input type="file" accept=".csv,.xlsx" className="max-w-64" disabled={busy || !!Object.keys(edits).length}
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} />
      </label>
      <Dialog open={!!rows} onOpenChange={(open) => { if (!open && !save.isPending) setRows(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{t("count.title")}</DialogTitle><DialogDescription>{t("count.hint")}</DialogDescription></DialogHeader>
          <div className="max-h-[45vh] overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("columns.product")}</TableHead><TableHead>{t("count.current")}</TableHead>
                <TableHead>{t("count.counted")}</TableHead><TableHead>{t("count.difference")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows?.map((row) => <TableRow key={row.row}>
                <TableCell>{row.name ?? row.identifier}<span className="block text-xs text-muted-foreground">{row.identifier}</span>
                  {row.error && <span className="block text-destructive">{t(`count.errors.${row.error}`)}</span>}</TableCell>
                <TableCell>{row.currentQuantity ?? "—"}</TableCell><TableCell>{row.quantity ?? "—"}</TableCell><TableCell>{row.difference ?? "—"}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
          {rows?.some((row) => row.error) && <p role="alert" className="text-destructive">{t("count.fixErrors")}</p>}
          {stale && <p role="alert" className="text-destructive">{t("count.reviewAgain")}</p>}
          <Label htmlFor="count-note">{t("noteOptional")}</Label><Input id="count-note" maxLength={200} value={note} disabled={save.isPending} onChange={(e) => setNote(e.target.value)} />
          <Button disabled={save.isPending || stale || !rows?.length || rows.some((row) => !!row.error)} onClick={() => save.mutate()}>{t("count.apply")}</Button>
          <Button variant="outline" disabled={save.isPending} onClick={() => {
            setRows(null);
            if (stale) { onSaved(); void client.invalidateQueries({ queryKey: ["inventory", storeId] }); }
          }}>{t("common:actions.cancel")}</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
