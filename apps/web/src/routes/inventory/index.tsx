import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDocumentLang } from "@/i18n/use-document-language";
import { unitDecimals, type InventoryItemDto, type StockAtDateRowDto } from "@pos/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";
import { adjustStock, fetchInventory, fetchStockAt, fetchStockMovements, lastYearEnd } from "@/features/inventory/api";
import { downloadCsv } from "@/lib/csv";
import { formatDateTime, formatQuantity } from "@/lib/format";

export function InventoryPage() {
  const { t } = useTranslation(["stock", "common"]);
  // Exports are for people outside the screen: the store's document language.
  const { t: docT } = useTranslation(["stock", "common"], { lng: useDocumentLang() });
  const money = useMoney();
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "OWNER" || role === "MANAGER";
  const queryClient = useQueryClient();
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [historyFor, setHistoryFor] = React.useState<InventoryItemDto | null>(null);

  const inventoryQuery = useQuery({
    queryKey: ["inventory", currentStoreId],
    queryFn: () => fetchInventory(currentStoreId!),
    enabled: !!currentStoreId,
  });

  const adjustMutation = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      adjustStock(currentStoreId!, productId, { quantity }),
    onSuccess: (_data, { productId }) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements", currentStoreId, productId] });
      setEdits(({ [productId]: _done, ...rest }) => rest);
      toast.success(t("inventory.updated"));
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">{t("noStore")}</p>;
  }

  const items = inventoryQuery.data ?? [];
  // Costs only come back for people who may see them.
  const showCosts = items.some((i) => i.averageCost !== undefined);
  const bookValue = items.reduce((sum, i) => sum + Math.max(Number(i.quantity), 0) * Number(i.averageCost ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold">{t("common:nav.inventory")}</h1>
          <p className="text-sm text-muted-foreground">{t("inventory.subtitle")}</p>
          {showCosts && items.length > 0 && (
            <p className="mt-1 text-sm">{t("inventory.bookValue", { value: money(bookValue) })}</p>
          )}
        </div>
        <Button
          variant="outline"
          disabled={!items.length}
          onClick={() =>
            downloadCsv(
              docT("inventory.exportFile"),
              [
                { header: docT("columns.product"), value: (i: InventoryItemDto) => i.product.name },
                { header: docT("columns.sku"), value: (i: InventoryItemDto) => i.product.sku },
                { header: docT("inventory.unit"), value: (i: InventoryItemDto) => i.product.unit ?? "un" },
                { header: docT("columns.quantity"), value: (i: InventoryItemDto) => i.quantity },
                { header: docT("inventory.reorderLevel"), value: (i: InventoryItemDto) => i.reorderLevel },
                ...(showCosts
                  ? [
                      { header: docT("inventory.averageCost"), value: (i: InventoryItemDto) => i.averageCost ?? "" },
                      { header: docT("inventory.value"), value: (i: InventoryItemDto) => (Number(i.quantity) * Number(i.averageCost ?? 0)).toFixed(2) },
                    ]
                  : []),
              ],
              items,
            )
          }
        >
          <Download className="mr-2 h-4 w-4" /> {t("common:actions.exportCsv")}
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.product")}</TableHead>
                <TableHead>{t("inventory.reorderLevel")}</TableHead>
                {showCosts && <TableHead className="text-right">{t("inventory.averageCost")}</TableHead>}
                <TableHead>{t("columns.quantity")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const unit = item.product.unit ?? "un";
                const editValue = edits[item.productId] ?? String(Number(item.quantity));
                const low = Number(item.quantity) <= Number(item.reorderLevel);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.product.name}
                      {low && (
                        <Badge variant="destructive" className="ml-2">
                          {t("inventory.lowStock")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatQuantity(item.reorderLevel, unit)}</TableCell>
                    {showCosts && <TableCell className="text-right text-muted-foreground">{money(item.averageCost ?? 0)}</TableCell>}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          step={unitDecimals(unit) > 0 ? 0.001 : 1}
                          className="w-28"
                          aria-label={t("inventory.countFor", { name: item.product.name })}
                          value={editValue}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [item.productId]: e.target.value }))}
                        />
                        {unit !== "un" && <span className="text-sm text-muted-foreground">{unit}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={adjustMutation.isPending}
                        onClick={() =>
                          adjustMutation.mutate({
                            productId: item.productId,
                            quantity: Number(editValue.replace(",", ".")),
                          })
                        }
                      >
                        {t("common:actions.save")}
                      </Button>
                      {canManage && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="ml-1"
                          aria-label={t("inventory.historyFor", { name: item.product.name })}
                          onClick={() => setHistoryFor(item)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {inventoryQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                    {t("inventory.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && <StockAtDate storeId={currentStoreId} />}

      <StockHistoryDialog storeId={currentStoreId} item={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

/** The stock and its book value at the end of a day: the yearly inventory at 31 December. */
function StockAtDate({ storeId }: { storeId: string }) {
  const { t } = useTranslation(["stock", "common"]);
  // Exports are for people outside the screen: the store's document language.
  const { t: docT } = useTranslation(["stock", "common"], { lng: useDocumentLang() });
  const money = useMoney();
  const [date, setDate] = React.useState(lastYearEnd());
  const [asked, setAsked] = React.useState<string | null>(null);
  const query = useQuery({
    queryKey: ["stock-at", storeId, asked],
    queryFn: () => fetchStockAt(storeId, asked!),
    enabled: !!asked,
  });
  const rows = query.data ?? [];
  const showCosts = rows.some((r) => r.value !== undefined);
  const total = rows.reduce((sum, r) => sum + Number(r.value ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("stockAt.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("stockAt.hint")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="stock-at-date">{t("stockAt.date")}</Label>
            <DateInput id="stock-at-date" className="w-44" value={date} onChange={setDate} />
          </div>
          <Button variant="outline" disabled={!date || query.isFetching} onClick={() => setAsked(date)}>
            {t("stockAt.show")}
          </Button>
          {rows.length > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  docT("stockAt.exportFile", { date: asked }),
                  [
                    { header: docT("columns.sku"), value: (r: StockAtDateRowDto) => r.sku },
                    { header: docT("columns.product"), value: (r: StockAtDateRowDto) => r.name },
                    { header: docT("stockAt.productType"), value: (r: StockAtDateRowDto) => r.productType },
                    { header: docT("stockAt.inventoryType"), value: (r: StockAtDateRowDto) => r.inventoryType ?? "" },
                    { header: docT("inventory.unit"), value: (r: StockAtDateRowDto) => r.unit },
                    { header: docT("columns.quantity"), value: (r: StockAtDateRowDto) => r.quantity },
                    ...(showCosts
                      ? [
                          { header: docT("inventory.averageCost"), value: (r: StockAtDateRowDto) => r.averageCost ?? "" },
                          { header: docT("inventory.value"), value: (r: StockAtDateRowDto) => r.value ?? "" },
                        ]
                      : []),
                  ],
                  rows,
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> {t("common:actions.exportCsv")}
            </Button>
          )}
        </div>
        {asked && !query.isFetching && rows.length === 0 && <p className="text-sm text-muted-foreground">{t("stockAt.empty")}</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.product")}</TableHead>
                  <TableHead className="text-right">{t("columns.quantity")}</TableHead>
                  {showCosts && <TableHead className="text-right">{t("inventory.averageCost")}</TableHead>}
                  {showCosts && <TableHead className="text-right">{t("inventory.value")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.productId}>
                    <TableCell>
                      {r.name} <span className="text-xs text-muted-foreground">{r.sku}</span>
                    </TableCell>
                    <TableCell className="text-right">{formatQuantity(r.quantity, r.unit)}</TableCell>
                    {showCosts && <TableCell className="text-right">{money(r.averageCost ?? 0)}</TableCell>}
                    {showCosts && <TableCell className="text-right">{money(r.value ?? 0)}</TableCell>}
                  </TableRow>
                ))}
                {showCosts && (
                  <TableRow className="font-semibold">
                    <TableCell colSpan={3}>{t("stockAt.total")}</TableCell>
                    <TableCell className="text-right">{money(total)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StockHistoryDialog({ storeId, item, onClose }: { storeId: string; item: InventoryItemDto | null; onClose: () => void }) {
  const { t } = useTranslation(["stock", "common"]);
  const money = useMoney();
  const query = useQuery({
    queryKey: ["stock-movements", storeId, item?.productId],
    queryFn: () => fetchStockMovements(storeId, item!.productId),
    enabled: !!item,
  });
  const unit = item?.product.unit ?? "un";
  const movements = query.data ?? [];
  const showCosts = movements.some((m) => m.averageCost !== undefined);

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("history.title", { name: item?.product.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("history.hint")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("history.when")}</TableHead>
                <TableHead>{t("history.what")}</TableHead>
                <TableHead className="text-right">{t("columns.quantity")}</TableHead>
                <TableHead className="text-right">{t("history.balance")}</TableHead>
                {showCosts && <TableHead className="text-right">{t("inventory.averageCost")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(m.occurredAt)}</TableCell>
                  <TableCell>
                    {t(`history.types.${m.type}`)}
                    {m.note && <span className="block text-xs text-muted-foreground">{m.note}</span>}
                  </TableCell>
                  <TableCell className={`text-right ${Number(m.quantity) < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
                    {Number(m.quantity) > 0 ? "+" : ""}
                    {formatQuantity(m.quantity, unit)}
                  </TableCell>
                  <TableCell className="text-right">{formatQuantity(m.balance, unit)}</TableCell>
                  {showCosts && <TableCell className="text-right">{money(m.averageCost ?? 0)}</TableCell>}
                </TableRow>
              ))}
              {!query.isLoading && movements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                    {t("history.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
