import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, FileText, History, LockKeyhole, Pause, Percent, ShoppingCart, Vault } from "lucide-react";
import { toast } from "sonner";
import { useCurrentShift, useShiftStore } from "@/features/shifts/shift-store";
import { adoptShift, fetchCurrentShift } from "@/features/shifts/api";
import type { LocalShift } from "@/features/shifts/ledger";
import { OpenShiftPanel } from "@/features/shifts/components/OpenShiftPanel";
import { OthersShiftPanel } from "@/features/shifts/components/OthersShiftPanel";
import { useCloseShiftRequest } from "@/features/shifts/close-request";
import { CashMovementDialog } from "@/features/shifts/components/CashMovementDialog";
import { CloseShiftDialog } from "@/features/shifts/components/CloseShiftDialog";
import { isWorkingOffline, useOfflineStore } from "@/features/pos/offline-store";
import { CreditOption } from "@/features/pos/components/CreditOption";
import { creditSplit, NO_CREDIT, type CreditChoice } from "@/features/pos/credit";
import { useTranslation } from "react-i18next";
import { countryConfig, DrawerOpenReason, fromCents, lineGrossCents, PaymentMethod, Permission } from "@pos/shared";
import type { CustomerCardDto, CustomerDto, SaleDto, SalePaymentInputDto } from "@pos/shared";
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
import { FiscalDocumentDialog } from "@/features/fiscal/components/FiscalDocumentDialog";
import { saleDocument } from "@/features/fiscal/sale-document";
import { PaymentPanel } from "@/features/pos/components/PaymentPanel";
import { RecentSalesSheet } from "@/features/pos/components/RecentSalesSheet";
import { HeldOrdersSheet } from "@/features/pos/components/HeldOrdersSheet";
import { useHeldOrders, useStoreHeldOrders, type HeldOrder } from "@/features/pos/held-orders";
import { DiscountDialog } from "@/features/pos/components/DiscountDialog";
import { PriceDialog } from "@/features/pos/components/PriceDialog";
import type { Approval } from "@/features/overrides/approval";
import { discountLabel } from "@/features/pos/discount-label";
import { CustomerSearchCombobox } from "@/features/pos/components/CustomerSearchCombobox";
import { linePrice, useCart, type CartLine } from "@/features/pos/hooks/useCart";
import { createSale } from "@/features/pos/api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError, apiClient } from "@/lib/api-client";
import { printDocument } from "@/features/desktop/printing";
import { PrintButton } from "@/components/print/PrintButton";
import { logSlipPrint } from "@/features/fiscal/print-log";
import { useDeviceStore } from "@/features/desktop/bridge";
import { syncTillSeries } from "@/features/fiscal/numbering";
import { fetchFiscalDocument } from "@/features/fiscal/api";
import { posFetchProducts } from "@/features/pos/catalog";
import { useSearchParams } from "react-router-dom";
import { openCashDrawer, useCanOpenDrawer, useHasDrawer } from "@/features/desktop/drawer";
import { OpenDrawerDialog } from "@/features/desktop/components/OpenDrawerDialog";
import { useCustomerDisplay } from "@/features/desktop/customer-display";
import { useMoney } from "@/features/business/use-money";

export function PosPage() {
  const { t } = useTranslation(["pos", "shifts"]);
  const money = useMoney();
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const stores = useAuthStore((s) => s.stores);
  const currentStore = stores.find((s) => s.id === currentStoreId);
  const {
    lines,
    priced,
    saleDiscount,
    addProduct,
    setQuantity,
    setLineDiscount,
    setSaleDiscount,
    setLinePrice,
    removeLine,
    clear: clearCart,
    restore,
    totals,
  } = useCart();
  // Managers' approvals for this sale (discounts, price changes), one per
  // permission; they go with the sale and are used once.
  const [approvals, setApprovals] = React.useState<Partial<Record<Permission, Approval>>>({});
  const addApproval = React.useCallback((approval: Approval | null | undefined) => {
    if (approval) setApprovals((a) => ({ ...a, [approval.permission]: approval }));
  }, []);
  const clear = React.useCallback(() => {
    clearCart();
    setApprovals({});
  }, [clearCart]);
  const [priceFor, setPriceFor] = React.useState<CartLine | null>(null);
  // Someone else took over the till (PIN): their own cart, not the last person's.
  const userId = useAuthStore((s) => s.user?.id);
  const cartOwner = React.useRef(userId);
  React.useEffect(() => {
    if (cartOwner.current !== userId) clear();
    cartOwner.current = userId;
  }, [userId, clear]);
  const [discountFor, setDiscountFor] = React.useState<CartLine | "sale" | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [payments, setPayments] = React.useState<SalePaymentInputDto[]>([]);
  const [paymentsValid, setPaymentsValid] = React.useState(true);
  const [customer, setCustomerState] = React.useState<CustomerDto | null>(null);
  // A sale on credit (online, fiscal stores): the rest of the total goes on the customer's account.
  const [credit, setCredit] = React.useState<CreditChoice>(NO_CREDIT);
  const [creditValid, setCreditValid] = React.useState(true);
  const setCustomer = React.useCallback((c: CustomerDto | null) => {
    setCustomerState(c);
    setCredit(NO_CREDIT);
  }, []);
  const online = useOfflineStore((s) => !isWorkingOffline(s));
  const [receiptEmail, setReceiptEmail] = React.useState("");
  const [completedSale, setCompletedSale] = React.useState<SaleDto | null>(null);
  const [completedCustomer, setCompletedCustomer] = React.useState<CustomerDto | null>(null);
  const [paymentPanelKey, setPaymentPanelKey] = React.useState(0);
  const [cartSheetOpen, setCartSheetOpen] = React.useState(false);
  const [quoteOpen, setQuoteOpen] = React.useState(false);
  const [recentOpen, setRecentOpen] = React.useState(false);
  const [heldOpen, setHeldOpen] = React.useState(false);
  const [holdNoteOpen, setHoldNoteOpen] = React.useState(false);
  const [holdNote, setHoldNote] = React.useState("");
  const heldOrders = useStoreHeldOrders(currentStoreId);

  /** Puts the current order on hold and empties the till for the next customer. */
  function holdCurrent(note: string | null) {
    const user = useAuthStore.getState().user;
    if (!currentStoreId || !user || lines.length === 0) return;
    useHeldOrders.getState().hold({
      storeId: currentStoreId,
      heldBy: { id: user.id, name: `${user.firstName} ${user.lastName}` },
      lines,
      saleDiscount,
      customer,
      note: note?.trim() || null,
      approvals: Object.values(approvals).filter((a): a is Approval => !!a),
    });
    clear();
    setCustomer(null);
    setPaymentPanelKey((k) => k + 1);
  }

  /** Carries on with a held order; one already in the till is held first, so nothing is lost. */
  function resumeHeld(order: HeldOrder) {
    const taken = useHeldOrders.getState().take(order.id);
    if (!taken) return;
    if (lines.length > 0) {
      holdCurrent(null);
      toast.info(t("held.swapped"));
    }
    restore(taken.lines, taken.saleDiscount);
    setApprovals(Object.fromEntries((taken.approvals ?? []).map((a) => [a.permission, a])));
    setCustomer(taken.customer);
    setHeldOpen(false);
    setCartSheetOpen(false);
  }

  // Shifts: no selling until this person opens one on this till; a shift
  // someone else left open has to be closed first (by them, or a manager).
  const shift = useCurrentShift(currentStoreId);
  const role = useAuthStore((s) => s.user?.role);
  const othersShift = shift && shift.openedBy.id !== userId ? shift : null;
  const needsShift = !shift;
  const [movementOpen, setMovementOpen] = React.useState(false);
  // A copy, so the close dialog keeps it after the shift is cleared.
  const [closing, setClosing] = React.useState<LocalShift | null>(null);
  const terminalId = useDeviceStore((s) => s.terminal?.id ?? null);
  React.useEffect(() => {
    if (shift || !currentStoreId || isWorkingOffline()) return;
    // Opened on another device, or this one lost its record (app closed
    // or crashed): carry on with it.
    fetchCurrentShift(currentStoreId, terminalId)
      .then((open) => {
        if (open && !useShiftStore.getState().current) adoptShift(open);
      })
      .catch(() => undefined);
  }, [shift, currentStoreId, terminalId]);
  // Where this till's document series are, so it can number its own (offline too).
  // Its signing key too: fetched, rotated, or dropped if the till's access was withdrawn.
  React.useEffect(() => {
    if (!terminalId || isWorkingOffline()) return;
    void syncTillSeries({ id: terminalId }).catch(() => undefined);
    void useDeviceStore.getState().refreshTill(true);
  }, [terminalId]);
  // Log out with a shift open: close it first (blind count, report, then sign out).
  const closeRequested = useCloseShiftRequest((s) => s.requested);
  React.useEffect(() => {
    if (!closeRequested) return;
    useCloseShiftRequest.getState().done();
    if (shift && !othersShift) setClosing(shift);
  }, [closeRequested, shift, othersShift]);
  // Kept separate from completedSale: only one dialog (and print area) is mounted at a time.
  const [invoiceFor, setInvoiceFor] = React.useState<{ sale: SaleDto; customer: CustomerDto | null } | null>(null);
  const [viewingDocument, setViewingDocument] = React.useState<string | null>(null);
  // Opened right after a sale in a store that prints A4: print the original at once.
  const [autoPrintDocument, setAutoPrintDocument] = React.useState(false);
  // A Factura Pró-forma being sold (opened from Invoices): the sale invoices it.
  const [proforma, setProforma] = React.useState<{ id: string; documentNo: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  React.useEffect(() => {
    const id = searchParams.get("proforma");
    if (!id) return;
    setSearchParams({}, { replace: true });
    void (async () => {
      try {
        const doc = await fetchFiscalDocument(id);
        if (doc.documentType !== "PF" || doc.status !== "N") {
          toast.error(t("proforma.notOpen", { number: doc.documentNo }));
          return;
        }
        const products = new Map((await posFetchProducts()).map((p) => [p.id, p]));
        const restored: CartLine[] = doc.lines.flatMap((l) => {
          const product = l.productId ? products.get(l.productId) : undefined;
          return product ? [{ product, quantity: Number(l.quantity) }] : [];
        });
        restore(restored, null);
        if (doc.customerId) setCustomer((await apiClient.get<CustomerCardDto>(`/customers/${doc.customerId}/card`)).customer);
        setProforma({ id: doc.id, documentNo: doc.documentNo });
      } catch (error) {
        toast.error((error as Error).message);
      }
    })();
  }, [searchParams, setSearchParams, restore, setCustomer, t]);
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
  // The store prints A4 documents after a sale (Settings → Stores), when the sale has one on the server.
  const a4Document = completedSale && currentStore?.saleDocumentFormat === "A4" ? (saleDocument(completedSale)?.id ?? null) : null;
  React.useEffect(() => {
    if (!completedSale || !autoPrint || autoPrintedFor.current === completedSale.id) return;
    const saleId = completedSale.id;
    // Marked inside the frame, so a cancelled frame (StrictMode remount)
    // doesn't count as printed.
    const frame = requestAnimationFrame(() => {
      autoPrintedFor.current = saleId;
      if (a4Document) {
        setAutoPrintDocument(true);
        setViewingDocument(a4Document);
        setCompletedSale(null);
        return;
      }
      logSlipPrint(completedSale);
      void printDocument();
    });
    return () => cancelAnimationFrame(frame);
  }, [completedSale, autoPrint, a4Document]);
  const checkoutAreaRef = React.useRef<HTMLDivElement>(null);

  const saleMutation = useMutation({
    mutationFn: () =>
      createSale(
        {
          storeId: currentStoreId!,
          customerId: customer?.id ?? null,
          receiptEmail: receiptEmail.trim() || undefined,
          payments: split.paidNow > 0 ? payments : [],
          lineItems: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, discount: l.discount ?? undefined })),
          discount: saleDiscount ?? undefined,
          shiftClientId: shift?.clientId,
          proformaId: proforma?.id,
          creditAmount: split.onAccount > 0 ? split.onAccount : undefined,
        },
        lines,
        Object.values(approvals).filter((a): a is Approval => !!a),
      ),
    onSuccess: (sale) => {
      // The sale is already saved (on the server or in the outbox): open
      // the drawer now, without waiting for printing or sync.
      if (hasDrawer && openOnCash && sale.payments.some((p) => p.method === PaymentMethod.CASH)) {
        void openCashDrawer({ reason: DrawerOpenReason.SALE_CASH_PAYMENT, saleClientId: sale.clientId ?? undefined });
      }
      const cashier = useAuthStore.getState().user;
      useShiftStore.getState().recordSale(sale, cashier ? `${cashier.firstName} ${cashier.lastName}` : "");
      setCompletedSale(sale);
      setCompletedCustomer(customer);
      setProforma(null);
      clear();
      setCustomer(null);
      setReceiptEmail("");
      setPaymentPanelKey((k) => k + 1);
      setCartSheetOpen(false);
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
      // What the customer has bought and owes changed.
      if (sale.customerId) queryClient.invalidateQueries({ queryKey: ["customer-card", sale.customerId] });
    },
  });

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">{t("noStore")}</p>;
  }
  const creditOffered = online && !!countryConfig(currentStore?.country ?? null);
  const split = creditSplit(totals.total, credit);

  const checkoutPanel = (
    <>
      <div className="flex-1 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("totals.subtotal")}</span>
          {/* After line discounts, so it adds up with the cart lines (as on the receipt). */}
          <span>{money(totals.subtotal - (totals.discountTotal - totals.saleDiscount))}</span>
        </div>
        {totals.saleDiscount > 0 && saleDiscount && (
          <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
            <span>
              {t("totals.saleDiscount")}
              {saleDiscount.type === "PERCENT" && ` (${discountLabel(saleDiscount, money)})`}
            </span>
            <span>-{money(totals.saleDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("totals.tax")}</span>
          <span>{money(totals.taxTotal)}</span>
        </div>
        <div className="flex justify-between text-lg font-semibold">
          <span>{t("totals.total")}</span>
          <span>{money(totals.total)}</span>
        </div>
        {lines.length > 0 && (
          <Button variant="ghost" size="sm" className="-ml-2 gap-2" onClick={() => setDiscountFor("sale")}>
            <Percent className="h-3.5 w-3.5" /> {saleDiscount ? t("checkout.changeSaleDiscount") : t("checkout.saleDiscount")}
          </Button>
        )}
      </div>

      <div className="space-y-3" ref={checkoutAreaRef}>
        {othersShift ? (
          <OthersShiftPanel
            shift={othersShift}
            canForceClose={role === "OWNER" || role === "MANAGER"}
            onForceClose={() => setClosing(othersShift)}
          />
        ) : needsShift ? (
          <OpenShiftPanel storeId={currentStoreId} />
        ) : (
        <>
        <CustomerSearchCombobox selected={customer} onSelect={setCustomer} />
        <Input
          type="email"
          placeholder={t("checkout.emailReceipt")}
          value={receiptEmail}
          onChange={(e) => setReceiptEmail(e.target.value)}
        />
        {creditOffered && (
          <CreditOption
            customer={customer}
            total={totals.total}
            value={credit}
            onChange={setCredit}
            onApproval={addApproval}
            onValidity={setCreditValid}
          />
        )}
        {split.paidNow > 0 && (
          <PaymentPanel
            key={`${paymentPanelKey}-${credit.on}`}
            total={split.paidNow}
            onChange={(p, valid) => {
              setPayments(p);
              setPaymentsValid(valid);
            }}
          />
        )}

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
          disabled={lines.length === 0 || (split.paidNow > 0 && !paymentsValid) || !creditValid || saleMutation.isPending}
          onClick={() => saleMutation.mutate()}
        >
          {saleMutation.isPending ? t("checkout.processing") : t("checkout.charge", { amount: money(totals.total) })}
        </Button>
        </>
        )}
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
          <Button variant="outline" disabled={lines.length === 0} onClick={() => setHoldNoteOpen(true)}>
            <Pause className="mr-2 h-4 w-4" /> {t("held.hold")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setCartSheetOpen(false);
              setHeldOpen(true);
            }}
          >
            {t("held.title")}
            {heldOrders.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {heldOrders.length}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            className="col-span-2"
            onClick={() => {
              setCartSheetOpen(false);
              setRecentOpen(true);
            }}
          >
            <History className="mr-2 h-4 w-4" /> {t("checkout.recentSales")}
          </Button>
          {shift && !othersShift && (
            <Button
              variant="outline"
              onClick={() => {
                setCartSheetOpen(false);
                setMovementOpen(true);
              }}
            >
              <ArrowDownUp className="mr-2 h-4 w-4" /> {t("shifts:buttons.cashInOut")}
            </Button>
          )}
          {shift && !othersShift && (
            <Button
              variant="outline"
              onClick={() => {
                setCartSheetOpen(false);
                setClosing(shift);
              }}
            >
              <LockKeyhole className="mr-2 h-4 w-4" /> {t("shifts:buttons.close")}
            </Button>
          )}
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
        {proforma && (
          <div className="mb-2 flex items-center justify-between rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm dark:border-sky-800 dark:bg-sky-950" role="status">
            <span>{t("proforma.selling", { number: proforma.documentNo })}</span>
            <Button variant="ghost" size="sm" onClick={() => setProforma(null)}>
              {t("proforma.detach")}
            </Button>
          </div>
        )}
        <Cart
          lines={lines}
          priced={priced.lines}
          onSetQuantity={setQuantity}
          onRemove={removeLine}
          onDiscount={(line) => setDiscountFor(line)}
          onChangePrice={(line) => setPriceFor(line)}
        />
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
      <FiscalDocumentDialog
        documentId={viewingDocument}
        autoPrint={autoPrintDocument}
        onClose={() => {
          setViewingDocument(null);
          setAutoPrintDocument(false);
        }}
      />

      <OpenDrawerDialog open={drawerDialogOpen} onOpenChange={setDrawerDialogOpen} />
      {shift && <CashMovementDialog shift={shift} open={movementOpen} onOpenChange={setMovementOpen} />}
      <CloseShiftDialog shift={closing} store={currentStore} open={!!closing} onOpenChange={(o) => !o && setClosing(null)} />
      <HeldOrdersSheet open={heldOpen} onOpenChange={setHeldOpen} storeId={currentStoreId} onResume={resumeHeld} />
      <Dialog open={holdNoteOpen} onOpenChange={setHoldNoteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("held.holdTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              holdCurrent(holdNote);
              setHoldNote("");
              setHoldNoteOpen(false);
            }}
          >
            <Input
              autoFocus
              aria-label={t("held.note")}
              placeholder={t("held.notePlaceholder")}
              value={holdNote}
              onChange={(e) => setHoldNote(e.target.value)}
            />
            <Button type="submit" className="w-full">
              <Pause className="mr-2 h-4 w-4" /> {t("held.hold")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <RecentSalesSheet open={recentOpen} onOpenChange={setRecentOpen} storeId={currentStoreId} store={currentStore} />
      <DiscountDialog
        open={discountFor !== null}
        onOpenChange={(open) => !open && setDiscountFor(null)}
        title={
          discountFor === "sale" || discountFor === null
            ? t("discount.titleSale")
            : t("discount.titleLine", { name: discountFor.product.name })
        }
        base={
          discountFor === "sale" || discountFor === null
            ? totals.subtotal - (totals.discountTotal - totals.saleDiscount)
            : fromCents(lineGrossCents(linePrice(discountFor), discountFor.quantity))
        }
        current={discountFor === "sale" || discountFor === null ? saleDiscount : discountFor.discount}
        onApply={(d, approval) => {
          if (discountFor === "sale") setSaleDiscount(d);
          else if (discountFor) setLineDiscount(discountFor.product.id, d);
          addApproval(approval);
        }}
      />
      <PriceDialog
        line={priceFor}
        onOpenChange={(open) => !open && setPriceFor(null)}
        onApply={(price, approval) => {
          if (priceFor) setLinePrice(priceFor.product.id, price);
          addApproval(approval);
        }}
      />
      <PrintQuoteDialog
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        lines={lines}
        saleDiscount={saleDiscount}
        store={currentStore}
        customer={customer}
        onProforma={setViewingDocument}
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
            <PrintButton
              label={t("complete.printReceipt")}
              onPrint={({ copies, deviceName }) => {
                if (completedSale) logSlipPrint(completedSale, copies);
                return printDocument({ copies, deviceName });
              }}
            />
            <Button
              variant={a4Document ? "default" : "outline"}
              // A sale still queued offline has no document on the server yet.
              disabled={!!completedSale && !!saleDocument(completedSale) && !saleDocument(completedSale)!.id}
              onClick={() => {
                const document = completedSale ? saleDocument(completedSale) : null;
                // Where sales are fiscal documents, the A4 is the sale's own Factura-Recibo.
                if (document) setViewingDocument(document.id);
                else setInvoiceFor({ sale: completedSale!, customer: completedCustomer });
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
