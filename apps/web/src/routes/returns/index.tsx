import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
import { createReturn, fetchReturns } from "@/features/returns/api";
import { fetchSalesByStore } from "@/features/sales/api";
import { useAuthStore } from "@/features/auth/store";

export function ReturnsPage() {
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const returnsQuery = useQuery({
    queryKey: ["returns", currentStoreId],
    queryFn: () => fetchReturns(currentStoreId!),
    enabled: !!currentStoreId,
  });
  const salesQuery = useQuery({
    queryKey: ["sales", currentStoreId],
    queryFn: () => fetchSalesByStore(currentStoreId!),
    enabled: !!currentStoreId && dialogOpen,
  });

  const [saleId, setSaleId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});

  const selectedSale = salesQuery.data?.find((s) => s.id === saleId);

  const createMutation = useMutation({
    mutationFn: () =>
      createReturn({
        storeId: currentStoreId!,
        saleId,
        reason: reason || undefined,
        lineItems: Object.entries(quantities)
          .filter(([, qty]) => Number(qty) > 0)
          .map(([productId, qty]) => ({ productId, quantity: Number(qty) })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns", currentStoreId] });
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
      setDialogOpen(false);
      setSaleId("");
      setReason("");
      setQuantities({});
    },
  });

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">No store selected.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Returns</h1>
          <p className="text-sm text-muted-foreground">Process refunds against a past sale.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New return
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New return</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label>Sale</Label>
                <Select
                  value={saleId}
                  onValueChange={(v) => {
                    setSaleId(v);
                    setQuantities({});
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a recent sale" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesQuery.data?.map((sale) => (
                      <SelectItem key={sale.id} value={sale.id}>
                        {sale.receiptNumber} — ${Number(sale.total).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSale && (
                <div className="space-y-2">
                  <Label>Items to return</Label>
                  {selectedSale.lineItems.map((line) => (
                    <div key={line.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex-1">
                        {line.product.name}{" "}
                        <span className="text-muted-foreground">(sold {line.quantity})</span>
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={line.quantity}
                        className="w-20"
                        value={quantities[line.productId] ?? ""}
                        onChange={(e) =>
                          setQuantities((prev) => ({ ...prev, [line.productId]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="reason">Reason</Label>
                <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>

              {createMutation.isError && (
                <p className="text-sm text-destructive">{(createMutation.error as Error).message}</p>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending || !saleId}>
                {createMutation.isPending ? "Processing..." : "Process return"}
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
                <th className="p-3 font-medium">Items</th>
                <th className="p-3 font-medium">Reason</th>
                <th className="p-3 font-medium text-right">Refund</th>
              </tr>
            </thead>
            <tbody>
              {returnsQuery.data?.map((ret) => (
                <tr key={ret.id} className="border-b last:border-0">
                  <td className="p-3 text-muted-foreground">
                    {new Date(ret.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-muted-foreground">{ret.lineItems.length}</td>
                  <td className="p-3 text-muted-foreground">{ret.reason ?? "—"}</td>
                  <td className="p-3 text-right">${Number(ret.totalRefund).toFixed(2)}</td>
                </tr>
              ))}
              {returnsQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No returns processed yet.
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
