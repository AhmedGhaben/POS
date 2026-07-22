import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import type { CustomerDto, SaleDto, SalePaymentInputDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  const [receiptEmail, setReceiptEmail] = React.useState("");
  const [completedSale, setCompletedSale] = React.useState<SaleDto | null>(null);
  const [completedCustomer, setCompletedCustomer] = React.useState<CustomerDto | null>(null);
  const [paymentPanelKey, setPaymentPanelKey] = React.useState(0);
  const [cartSheetOpen, setCartSheetOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const checkoutAreaRef = React.useRef<HTMLDivElement>(null);

  const saleMutation = useMutation({
    mutationFn: () =>
      createSale(
        {
          storeId: currentStoreId!,
          customerId: customer?.id ?? null,
          receiptEmail: receiptEmail.trim() || undefined,
          payments,
          lineItems: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        },
        lines,
      ),
    onSuccess: (sale) => {
      setCompletedSale(sale);
      setCompletedCustomer(customer);
      clear();
      setCustomer(null);
      setReceiptEmail("");
      setPaymentPanelKey((k) => k + 1);
      setCartSheetOpen(false);
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
    },
  });

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">No store selected.</p>;
  }

  const checkoutPanel = (
    <>
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
        <Input
          type="email"
          placeholder="Email receipt (optional)"
          value={receiptEmail}
          onChange={(e) => setReceiptEmail(e.target.value)}
        />
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
    </>
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
      <div className="flex flex-1 flex-col overflow-y-auto border-r p-4 lg:overflow-visible">
        <ProductSearchInput onSelect={addProduct} suppressRefocusRef={checkoutAreaRef} />
        <CategoryFilter selectedCategoryId={selectedCategoryId} onSelect={setSelectedCategoryId} />
        <ProductGrid categoryId={selectedCategoryId} onSelect={addProduct} />
        <Cart lines={lines} onSetQuantity={setQuantity} onRemove={removeLine} />
      </div>

      <div className="hidden w-96 flex-col p-4 lg:flex">{checkoutPanel}</div>

      <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
        <SheetTrigger asChild>
          <Button
            size="lg"
            className="fixed bottom-4 right-4 z-40 gap-2 shadow-lg lg:hidden"
          >
            <ShoppingCart className="h-4 w-4" />
            Cart
            {lines.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {lines.length}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col p-4 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Checkout</SheetTitle>
          </SheetHeader>
          {checkoutPanel}
        </SheetContent>
      </Sheet>

      <Dialog open={!!completedSale} onOpenChange={(open) => !open && setCompletedSale(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sale complete</DialogTitle>
          </DialogHeader>
          {completedSale?.receiptNumber.startsWith("OFFLINE-") && (
            <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
              Saved offline — this sale will sync automatically once you're back online.
            </p>
          )}
          {completedSale && (
            <Receipt sale={completedSale} storeName={storeName} customer={completedCustomer} />
          )}
          <Button onClick={() => window.print()}>Print receipt</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
