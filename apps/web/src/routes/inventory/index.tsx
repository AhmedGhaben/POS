import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/features/auth/store";
import { adjustStock, fetchInventory } from "@/features/inventory/api";

export function InventoryPage() {
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
    },
  });

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">No store selected.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Inventory</h1>
      <p className="mb-6 text-sm text-muted-foreground">Stock levels for the current store.</p>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">Reorder level</th>
                <th className="p-3 font-medium">Quantity</th>
                <th className="p-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {inventoryQuery.data?.map((item) => {
                const editValue = edits[item.productId] ?? String(item.quantity);
                const low = item.quantity <= item.reorderLevel;
                return (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="p-3">
                      {item.product.name}
                      {low && (
                        <Badge variant="destructive" className="ml-2">
                          Low stock
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{item.reorderLevel}</td>
                    <td className="p-3">
                      <Input
                        type="number"
                        min={0}
                        className="w-24"
                        value={editValue}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [item.productId]: e.target.value }))
                        }
                      />
                    </td>
                    <td className="p-3 text-right">
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
                        Save
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {inventoryQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No inventory yet for this store.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
