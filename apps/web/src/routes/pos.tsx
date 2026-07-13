import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PaymentMethod } from "@pos/shared";
import type { SaleDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductSearchInput } from "@/features/pos/components/ProductSearchInput";
import { CategoryFilter } from "@/features/pos/components/CategoryFilter";
import { ProductGrid } from "@/features/pos/components/ProductGrid";
import { Cart } from "@/features/pos/components/Cart";
import { Receipt } from "@/features/pos/components/Receipt";
import { useCart } from "@/features/pos/hooks/useCart";
import { createSale } from "@/features/pos/api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: "Cash",
  [PaymentMethod.CARD]: "Card",
  [PaymentMethod.MOBILE_MONEY]: "Mobile money",
  [PaymentMethod.OTHER]: "Other",
};

export function PosPage() {
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const stores = useAuthStore((s) => s.stores);
  const storeName = stores.find((s) => s.id === currentStoreId)?.name ?? "Store";
  const { lines, addProduct, setQuantity, removeLine, clear, totals } = useCart();
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(PaymentMethod.CASH);
  const [completedSale, setCompletedSale] = React.useState<SaleDto | null>(null);
  const queryClient = useQueryClient();

  const saleMutation = useMutation({
    mutationFn: () =>
      createSale({
        storeId: currentStoreId!,
        paymentMethod,
        lineItems: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      }),
    onSuccess: (sale) => {
      setCompletedSale(sale);
      clear();
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
    },
  });

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">No store selected.</p>;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex flex-1 flex-col border-r p-4">
        <ProductSearchInput onSelect={addProduct} />
        <CategoryFilter selectedCategoryId={selectedCategoryId} onSelect={setSelectedCategoryId} />
        <ProductGrid categoryId={selectedCategoryId} onSelect={addProduct} />
        <Cart lines={lines} onSetQuantity={setQuantity} onRemove={removeLine} />
      </div>

      <div className="flex w-96 flex-col p-4">
        <div className="flex-1 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>${totals.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span>${totals.taxTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span>${totals.total.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-3">
          <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(PaymentMethod).map((method) => (
                <SelectItem key={method} value={method}>
                  {PAYMENT_LABELS[method]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {saleMutation.isError && (
            <p className="text-sm text-destructive">
              {saleMutation.error instanceof ApiError
                ? saleMutation.error.message
                : "Unable to complete sale"}
            </p>
          )}

          <Button
            size="lg"
            className="w-full"
            disabled={lines.length === 0 || saleMutation.isPending}
            onClick={() => saleMutation.mutate()}
          >
            {saleMutation.isPending ? "Processing..." : `Charge $${totals.total.toFixed(2)}`}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={lines.length === 0}
            onClick={clear}
          >
            Clear cart
          </Button>
        </div>
      </div>

      <Dialog open={!!completedSale} onOpenChange={(open) => !open && setCompletedSale(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sale complete</DialogTitle>
          </DialogHeader>
          {completedSale && <Receipt sale={completedSale} storeName={storeName} />}
          <Button onClick={() => window.print()}>Print receipt</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
