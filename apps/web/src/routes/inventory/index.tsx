import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { InventoryItemDto } from "@pos/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthStore } from "@/features/auth/store";
import { adjustStock, fetchInventory } from "@/features/inventory/api";
import { downloadCsv } from "@/lib/csv";

export function InventoryPage() {
  const { t } = useTranslation(["stock", "common"]);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const queryClient = useQueryClient();
  const [edits, setEdits] = React.useState<Record<string, string>>({});

  const inventoryQuery = useQuery({
    queryKey: ["inventory", currentStoreId],
    queryFn: () => fetchInventory(currentStoreId!),
    enabled: !!currentStoreId,
  });

  const adjustMutation = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      adjustStock(currentStoreId!, productId, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
      toast.success(t("inventory.updated"));
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">{t("noStore")}</p>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold">{t("common:nav.inventory")}</h1>
          <p className="text-sm text-muted-foreground">{t("inventory.subtitle")}</p>
        </div>
        <Button
          variant="outline"
          disabled={!inventoryQuery.data?.length}
          onClick={() =>
            downloadCsv(
              t("inventory.exportFile"),
              [
                { header: t("columns.product"), value: (i: InventoryItemDto) => i.product.name },
                { header: t("columns.sku"), value: (i: InventoryItemDto) => i.product.sku },
                { header: t("columns.quantity"), value: (i: InventoryItemDto) => i.quantity },
                { header: t("inventory.reorderLevel"), value: (i: InventoryItemDto) => i.reorderLevel },
              ],
              inventoryQuery.data ?? [],
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
                <TableHead>{t("columns.quantity")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventoryQuery.data?.map((item) => {
                const editValue = edits[item.productId] ?? String(item.quantity);
                const low = item.quantity <= item.reorderLevel;
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
                    <TableCell className="text-muted-foreground">{item.reorderLevel}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="w-24"
                        value={editValue}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [item.productId]: e.target.value }))
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={adjustMutation.isPending}
                        onClick={() =>
                          adjustMutation.mutate({
                            productId: item.productId,
                            quantity: Number(editValue),
                          })
                        }
                      >
                        {t("common:actions.save")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {inventoryQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="p-6 text-center text-muted-foreground">
                    {t("inventory.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
