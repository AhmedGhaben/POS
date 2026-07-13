import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CustomerDto, SaleDto, SalePaymentInputDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductSearchInput } from "@/features/pos/components/ProductSearchInput";
import { CategoryFilter } from "@/features/pos/components/CategoryFilter";
import { ProductGrid } from "@/features/pos/components/ProductGrid";
import { Cart } from "@/features/pos/components/Cart";
import { Receipt } from "@/features/pos/components/Receipt";
import { PaymentPanel } from "@/features/pos/components/PaymentPanel";
import { CustomerSearchCombobox } from "@/features/pos/components/CustomerSearchCombobox";
import { useCart } from "@/features/pos/hooks/useCart";
import { createSale } from "@/features/pos/api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";

export function PosPage() {
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const stores = useAuthStore((s) => s.stores);
  const storeName = stores.find((s) => s.id === currentStoreId)?.name ?? "Store";
  const { lines, addProduct, setQuantity, removeLine, clear, totals } = useCart();
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [payments, setPayments] = React.useState<SalePaymentInputDto[]>([]);
  const [paymentsValid, setPaymentsValid] = React.useState(true);
  const [customer, setCustomer] = React.useState<CustomerDto | null>(null);
  const [completedSale, setCompletedSale] = React.useState<SaleDto | null>(null);
  const [completedCustomer, setCompletedCustomer] = React.useState<CustomerDto | null>(null);
  const [paymentPanelKey, setPaymentPanelKey] = React.useState(0);
  const queryClient = useQueryClient();
  const checkoutAreaRef = React.useRef<HTMLDivElement>(null);

  const saleMutation = useMutation({
    mutationFn: () =>
      createSale({
        storeId: currentStoreId!,
        customerId: customer?.id ?? null,
        payments,
        lineItems: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      }),
    onSuccess: (sale) => {
      setCompletedSale(sale);
      setCompletedCustomer(customer);
      clear();
      setCustomer(null);
      setPaymentPanelKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
    },
  });

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">No store selected.</p>;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex flex-1 flex-col border-r p-4">
        <ProductSearchInput onSelect={addProduct} suppressRefocusRef={checkoutAreaRef} />
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

        <div className="space-y-3" ref={checkoutAreaRef}>
          <CustomerSearchCombobox selected={customer} onSelect={setCustomer} />
          <PaymentPanel
            key={paymentPanelKey}
            total={totals.total}
            onChange={(p, valid) => {
              setPayments(p);
              setPaymentsValid(valid);
            }}
          />

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
            disabled={lines.length === 0 || !paymentsValid || saleMutation.isPending}
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
          {completedSale && (
            <Receipt sale={completedSale} storeName={storeName} customer={completedCustomer} />
          )}
          <Button onClick={() => window.print()}>Print receipt</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
