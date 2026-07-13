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
import { createTransfer, fetchTransfers } from "@/features/transfers/api";
import { fetchProducts } from "@/features/products/api";
import { useAuthStore } from "@/features/auth/store";

interface DraftLine {
  productId: string;
  quantity: string;
}

export function TransfersPage() {
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const stores = useAuthStore((s) => s.stores);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const transfersQuery = useQuery({
    queryKey: ["transfers", currentStoreId],
    queryFn: () => fetchTransfers(currentStoreId!),
    enabled: !!currentStoreId,
  });
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });

  const [fromStoreId, setFromStoreId] = React.useState("");
  const [toStoreId, setToStoreId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([{ productId: "", quantity: "1" }]);

  const createMutation = useMutation({
    mutationFn: () =>
      createTransfer({
        fromStoreId,
        toStoreId,
        note: note || undefined,
        lineItems: lines
          .filter((l) => l.productId && l.quantity)
          .map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers", currentStoreId] });
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
      setDialogOpen(false);
      setFromStoreId("");
      setToStoreId("");
      setNote("");
      setLines([{ productId: "", quantity: "1" }]);
    },
  });

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">No store selected.</p>;
  }

  const canSubmit =
    fromStoreId && toStoreId && fromStoreId !== toStoreId && lines.some((l) => l.productId && l.quantity);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Stock transfers</h1>
          <p className="text-sm text-muted-foreground">Move inventory between stores.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New transfer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New transfer</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>From store</Label>
                  <Select value={fromStoreId} onValueChange={setFromStoreId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>To store</Label>
                  <Select value={toStoreId} onValueChange={setToStoreId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores
                        .filter((store) => store.id !== fromStoreId)
                        .map((store) => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  onClick={() => setLines((prev) => [...prev, { productId: "", quantity: "1" }])}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add line
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="note">Note (optional)</Label>
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              {fromStoreId && toStoreId && fromStoreId === toStoreId && (
                <p className="text-sm text-destructive">Source and destination must be different.</p>
              )}
              {createMutation.isError && (
                <p className="text-sm text-destructive">{(createMutation.error as Error).message}</p>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending || !canSubmit}>
                {createMutation.isPending ? "Transferring..." : "Transfer stock"}
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
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">From</th>
                <th className="p-3 font-medium">To</th>
                <th className="p-3 font-medium">Items</th>
                <th className="p-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {transfersQuery.data?.map((transfer) => (
                <tr key={transfer.id} className="border-b last:border-0">
                  <td className="p-3 text-muted-foreground">
                    {new Date(transfer.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-3">{transfer.fromStore.name}</td>
                  <td className="p-3">{transfer.toStore.name}</td>
                  <td className="p-3 text-muted-foreground">
                    {transfer.lineItems.map((li) => `${li.quantity} × ${li.product.name}`).join(", ")}
                  </td>
                  <td className="p-3 text-muted-foreground">{transfer.note ?? "—"}</td>
                </tr>
              ))}
              {transfersQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No transfers yet.
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
