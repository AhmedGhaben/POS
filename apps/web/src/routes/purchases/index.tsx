import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPurchase, fetchPurchases } from "@/features/purchases/api";
import { fetchSuppliers } from "@/features/suppliers/api";
import { fetchProducts } from "@/features/products/api";
import { useAuthStore } from "@/features/auth/store";

interface DraftLine {
  productId: string;
  quantity: string;
  unitCost: string;
}

export function PurchasesPage() {
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const purchasesQuery = useQuery({
    queryKey: ["purchases", currentStoreId],
    queryFn: () => fetchPurchases(currentStoreId!),
    enabled: !!currentStoreId,
  });
  const suppliersQuery = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });

  const [supplierId, setSupplierId] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([{ productId: "", quantity: "1", unitCost: "" }]);

  const createMutation = useMutation({
    mutationFn: () =>
      createPurchase({
        storeId: currentStoreId!,
        supplierId,
        lineItems: lines
          .filter((l) => l.productId && l.quantity && l.unitCost)
          .map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitCost: Number(l.unitCost),
          })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases", currentStoreId] });
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
      setDialogOpen(false);
      setSupplierId("");
      setLines([{ productId: "", quantity: "1", unitCost: "" }]);
    },
  });

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">No store selected.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Purchases</h1>
          <p className="text-sm text-muted-foreground">Restock inventory from suppliers.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New purchase
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New purchase</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliersQuery.data?.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Line items</Label>
                {lines.map((line, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select value={line.productId} onValueChange={(v) => updateLine(index, { productId: v })}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Product" />
                      </SelectTrigger>
                      <SelectContent>
                        {productsQuery.data?.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      className="w-20"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="Unit cost"
                      className="w-28"
                      value={line.unitCost}
                      onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLines((prev) => [...prev, { productId: "", quantity: "1", unitCost: "" }])}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add line
                </Button>
              </div>

              {createMutation.isError && (
                <p className="text-sm text-destructive">{(createMutation.error as Error).message}</p>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending || !supplierId}>
                {createMutation.isPending ? "Saving..." : "Record purchase"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">PO #</th>
                <th className="p-3 font-medium">Supplier</th>
                <th className="p-3 font-medium">Items</th>
                <th className="p-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {purchasesQuery.data?.map((purchase) => (
                <tr key={purchase.id} className="border-b last:border-0">
                  <td className="p-3 font-mono text-xs">{purchase.purchaseNumber}</td>
                  <td className="p-3">{purchase.supplier.name}</td>
                  <td className="p-3 text-muted-foreground">{purchase.lineItems.length}</td>
                  <td className="p-3 text-right">${Number(purchase.total).toFixed(2)}</td>
                </tr>
              ))}
              {purchasesQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No purchases yet.
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
