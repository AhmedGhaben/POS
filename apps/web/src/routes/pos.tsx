import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, ShoppingCart, Vault } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DrawerOpenReason, PaymentMethod } from "@pos/shared";
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
import { PrintArea } from "@/components/print/PrintArea";
import { PrintQuoteDialog } from "@/features/pos/components/PrintQuoteDialog";
import { IssueInvoiceDialog } from "@/features/invoices/components/IssueInvoiceDialog";
import { PaymentPanel } from "@/features/pos/components/PaymentPanel";
import { CustomerSearchCombobox } from "@/features/pos/components/CustomerSearchCombobox";
import { useCart } from "@/features/pos/hooks/useCart";
import { createSale } from "@/features/pos/api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";
import { printDocument } from "@/features/desktop/printing";
import { useDeviceStore } from "@/features/desktop/bridge";
import { openCashDrawer, useCanOpenDrawer, useHasDrawer } from "@/features/desktop/drawer";
import { OpenDrawerDialog } from "@/features/desktop/components/OpenDrawerDialog";
import { useCustomerDisplay } from "@/features/desktop/customer-display";
import { useMoney } from "@/features/business/use-money";

export function PosPage() {
  const { t } = useTranslation("pos");
  const money = useMoney();
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const stores = useAuthStore((s) => s.stores);
  const currentStore = stores.find((s) => s.id === currentStoreId);
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
  const [quoteOpen, setQuoteOpen] = React.useState(false);
  // Kept separate from completedSale: only one dialog (and print area) is mounted at a time.
  const [invoiceFor, setInvoiceFor] = React.useState<{ sale: SaleDto; customer: CustomerDto | null } | null>(null);
  const queryClient = useQueryClient();

  // Windows app with auto-print on: the receipt goes to the printer as soon
  // as the sale completes (once the dialog has put it in the print area).
  const autoPrint = useDeviceStore((s) => !!s.printing?.autoPrintReceipt && !!s.printing.receipt.deviceName);
  const autoPrintedFor = React.useRef<string | null>(null);

  // Cash drawer (Windows app): opens by itself on cash sales; the manual
  // button needs OPEN_DRAWER and asks for a reason.
  const hasDrawer = useHasDrawer();
  const canOpenDrawer = useCanOpenDrawer();
  const openOnCash = useDeviceStore((s) => !!s.drawer?.openOnCashSale);
  const [drawerDialogOpen, setDrawerDialogOpen] = React.useState(false);

  // Customer display (pole or second screen): cart, then paid/change.
  useCustomerDisplay(lines, totals.total, completedSale);
  React.useEffect(() => {
    if (!completedSale || !autoPrint || autoPrintedFor.current === completedSale.id) return;
    const saleId = completedSale.id;
    // Marked inside the frame, so a cancelled frame (StrictMode remount)
    // doesn't count as printed.
    const frame = requestAnimationFrame(() => {
      autoPrintedFor.current = saleId;
      void printDocument();
    });
    return () => cancelAnimationFrame(frame);
  }, [completedSale, autoPrint]);
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
      // The sale is already saved (on the server or in the outbox): open
      // the drawer now, without waiting for printing or sync.
      if (hasDrawer && openOnCash && sale.payments.some((p) => p.method === PaymentMethod.CASH)) {
        void openCashDrawer({ reason: DrawerOpenReason.SALE_CASH_PAYMENT, saleClientId: sale.clientId ?? undefined });
      }
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
    return <p className="p-6 text-muted-foreground">{t("noStore")}</p>;
  }

  const checkoutPanel = (
    <>
      <div className="flex-1 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("totals.subtotal")}</span>
          <span>{money(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("totals.tax")}</span>
          <span>{money(totals.taxTotal)}</span>
        </div>
        <div className="flex justify-between text-lg font-semibold">
          <span>{t("totals.total")}</span>
          <span>{money(totals.total)}</span>
        </div>
      </div>

      <div className="space-y-3" ref={checkoutAreaRef}>
        <CustomerSearchCombobox selected={customer} onSelect={setCustomer} />
        <Input
          type="email"
          placeholder={t("checkout.emailReceipt")}
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
              : t("checkout.failed")}
          </p>
        )}

        <Button
          size="lg"
          className="w-full"
          disabled={lines.length === 0 || !paymentsValid || saleMutation.isPending}
          onClick={() => saleMutation.mutate()}
        >
          {saleMutation.isPending ? t("checkout.processing") : t("checkout.charge", { amount: money(totals.total) })}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={lines.length === 0}
            onClick={() => {
              setCartSheetOpen(false);
              setQuoteOpen(true);
            }}
          >
            <FileText className="mr-2 h-4 w-4" /> {t("checkout.printQuote")}
          </Button>
          <Button variant="outline" disabled={lines.length === 0} onClick={clear}>
            {t("checkout.clearCart")}
          </Button>
          {hasDrawer && canOpenDrawer && (
            <Button
              variant="outline"
              className="col-span-2"
              onClick={() => {
                setCartSheetOpen(false);
                setDrawerDialogOpen(true);
              }}
            >
              <Vault className="mr-2 h-4 w-4" /> {t("checkout.openDrawer")}
            </Button>
          )}
        </div>
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
            {t("cart.title")}
            {lines.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {lines.length}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col p-4 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("checkout.title")}</SheetTitle>
          </SheetHeader>
          {checkoutPanel}
        </SheetContent>
      </Sheet>

      <IssueInvoiceDialog
        sale={invoiceFor?.sale ?? null}
        customer={invoiceFor?.customer ?? null}
        onClose={() => setInvoiceFor(null)}
      />

      <OpenDrawerDialog open={drawerDialogOpen} onOpenChange={setDrawerDialogOpen} />
      <PrintQuoteDialog
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        lines={lines}
        store={currentStore}
        customer={customer}
      />

      <Dialog open={!!completedSale} onOpenChange={(open) => !open && setCompletedSale(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("complete.title")}</DialogTitle>
          </DialogHeader>
          {completedSale?.queued && (
            <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
              {t("complete.savedOffline")}
            </p>
          )}
          {completedSale && (
            <>
              <Receipt sale={completedSale} store={currentStore} customer={completedCustomer} />
              <PrintArea>
                <Receipt sale={completedSale} store={currentStore} customer={completedCustomer} />
              </PrintArea>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void printDocument()}>{t("complete.printReceipt")}</Button>
            <Button
              variant="outline"
              onClick={() => {
                setInvoiceFor({ sale: completedSale!, customer: completedCustomer });
                setCompletedSale(null);
              }}
            >
              <FileText className="mr-2 h-4 w-4" /> {t("complete.a4Invoice")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
