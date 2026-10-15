import * as React from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Download, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { Combobox } from "@/components/ui/combobox";
import { productOptions } from "@/lib/options";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createPurchase, fetchPurchasePage, type PurchasesFilter } from "@/features/purchases/api";
import { PurchaseDetailDialog } from "@/features/purchases/components/PurchaseDetailDialog";
import { downloadCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";

const PAGE = 25;
import { fetchSuppliers } from "@/features/suppliers/api";
import { fetchProducts } from "@/features/products/api";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";
import { fetchTaxRates, TAX_RATES_QUERY_KEY } from "@/features/business/api";
import { Badge } from "@/components/ui/badge";
import { DEDUCTIBLE_TYPES, PAYMENT_METHOD_ORDER, PaymentMethod, SUPPLIER_DOCUMENT_TYPES, type CreatePurchaseDto, type DeductibleType, type PurchaseDto, type SupplierDocumentType } from "@pos/shared";
import { purchaseTotals } from "@/features/purchases/totals";

const lineSchema = z.object({
  productId: z.string().min(1, "validation.required"),
  // Up to 3 decimals for products sold by weight; the server keeps "un" products whole.
  quantity: z.coerce.number().positive("validation.positive"),
  unitCost: z.coerce.number().min(0, "validation.nonNegative"),
});

const purchaseSchema = z
  .object({
    supplierId: z.string().min(1, "validation.required"),
    lines: z.array(lineSchema).min(1, "validation.addLine"),
    // The supplier's document (docs/plans/ANGOLA.md, phase 4).
    docType: z.string(),
    docNo: z.string().trim().max(60),
    docDate: z.string(),
    docHash: z.string().trim().regex(/^([A-Za-z0-9+/=]{4}|0)?$/, "purchases.hashInvalid"),
    // IVA: one rate on the whole purchase ("" = none), how much is deductible and as what.
    taxRate: z.string(),
    deductiblePercent: z.coerce.number().min(0, "validation.nonNegative").max(100),
    typology: z.string(),
    withholding: z.string(),
    paidNow: z.union([z.literal(""), z.coerce.number().min(0, "validation.nonNegative")]),
    paidMethod: z.string(),
  })
  .refine((v) => !v.docNo || !!v.docDate, { path: ["docDate"], message: "validation.required" });

const defaultValues = {
  supplierId: "",
  lines: [{ productId: "", quantity: "1", unitCost: "" }],
  docType: "FT",
  docNo: "",
  docDate: "",
  docHash: "",
  taxRate: "",
  deductiblePercent: "100",
  typology: "INV",
  withholding: "0",
  paidNow: "",
  paidMethod: PaymentMethod.BANK_TRANSFER,
};

export function PurchasesPage() {
  const { t } = useTranslation(["stock", "common"]);
  const money = useMoney();
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  // Filters (docs/plans/ANGOLA.md, phase 5): calendar dates are the store's days.
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [supplierFilter, setSupplierFilter] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [openId, setOpenId] = React.useState<string | null>(null);
  React.useEffect(() => setPage(0), [from, to, supplierFilter, statusFilter, search, currentStoreId]);
  const filter: Omit<PurchasesFilter, "take" | "skip"> = {
    storeId: currentStoreId!,
    from: from || undefined,
    to: to || undefined,
    supplierId: supplierFilter ?? undefined,
    paymentStatus: statusFilter ?? undefined,
    search: search.trim() || undefined,
  };
  const purchasesQuery = useQuery({
    queryKey: ["purchases", currentStoreId, filter, page],
    queryFn: () => fetchPurchasePage({ ...filter, take: PAGE, skip: page * PAGE }),
    enabled: !!currentStoreId,
    placeholderData: keepPreviousData,
  });
  const total = purchasesQuery.data?.total ?? 0;
  async function exportCsv() {
    const rows: PurchaseDto[] = [];
    for (let skip = 0; skip < Math.min(total, 5000); skip += 200) rows.push(...(await fetchPurchasePage({ ...filter, take: 200, skip })).items);
    downloadCsv(`${t("purchases.file")}.csv`, [
      { header: t("purchases.date"), value: (p: PurchaseDto) => formatDateTime(p.createdAt) },
      { header: t("purchases.poNumber"), value: (p: PurchaseDto) => p.purchaseNumber },
      { header: t("purchases.supplier"), value: (p: PurchaseDto) => p.supplier.name },
      { header: "NIF", value: (p: PurchaseDto) => p.supplier.taxId ?? "" },
      { header: t("purchases.docNo"), value: (p: PurchaseDto) => p.supplierDocNo ?? "" },
      { header: t("purchases.net"), value: (p: PurchaseDto) => p.subtotal },
      { header: t("purchases.iva"), value: (p: PurchaseDto) => p.taxTotal },
      { header: t("columns.total"), value: (p: PurchaseDto) => p.total },
      { header: t("purchases.withheld"), value: (p: PurchaseDto) => p.withholdingAmount ?? "0" },
      { header: t("purchases.paidAmount"), value: (p: PurchaseDto) => p.paidAmount ?? "" },
      { header: t("purchases.payment"), value: (p: PurchaseDto) => (p.paymentStatus ? t(`purchases.paymentStatus.${p.paymentStatus}`) : "") },
    ], rows);
  }
  const suppliersQuery = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });
  const ratesQuery = useQuery({ queryKey: TAX_RATES_QUERY_KEY, queryFn: fetchTaxRates });

  const form = useForm<z.input<typeof purchaseSchema>, unknown, z.output<typeof purchaseSchema>>({
    resolver: zodResolver(purchaseSchema),
    defaultValues,
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const watched = form.watch();
  const totals = purchaseTotals(watched.lines ?? [], Number(watched.taxRate) || 0, Number(watched.withholding) || 0);

  const createMutation = useMutation({
    mutationFn: (values: z.output<typeof purchaseSchema>) => {
      const rate = Number(values.taxRate) || 0;
      const t2 = purchaseTotals(values.lines, rate, Number(values.withholding) || 0);
      const dto: CreatePurchaseDto = {
        storeId: currentStoreId!,
        supplierId: values.supplierId,
        lineItems: values.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
        supplierDocument: values.docNo
          ? { type: values.docType as SupplierDocumentType, number: values.docNo, date: values.docDate, hash: values.docHash || undefined }
          : undefined,
        taxLines: values.taxRate !== "" ? [{ taxRate: rate, base: t2.net, deductiblePercent: values.deductiblePercent, typology: values.typology as DeductibleType }] : undefined,
        withholdingPercent: Number(values.withholding) > 0 ? Number(values.withholding) : undefined,
        payment: values.paidNow !== "" && Number(values.paidNow) > 0 ? { amount: Number(values.paidNow), method: values.paidMethod as PaymentMethod } : undefined,
      };
      return createPurchase(dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases", currentStoreId] });
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setDialogOpen(false);
      form.reset(defaultValues);
      toast.success(t("purchases.done"));
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">{t("noStore")}</p>;
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("common:nav.purchases")}</h1>
          <p className="text-sm text-muted-foreground">{t("purchases.subtitle")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> {t("purchases.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("purchases.new")}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
              >
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchases.supplier")}</FormLabel>
                      <FormControl>
                        <Combobox
                          value={field.value}
                          onChange={(v) => field.onChange(v ?? "")}
                          placeholder={t("purchases.selectSupplier")}
                          options={(suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name, description: s.phone ?? undefined }))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <Label>{t("lineItems")}</Label>
                  {fields.map((line, index) => (
                    <div key={line.id} className="flex items-start gap-2">
                      <FormField
                        control={form.control}
                        name={`lines.${index}.productId`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Combobox
                                value={field.value}
                                onChange={(v) => field.onChange(v ?? "")}
                                placeholder={t("columns.product")}
                                aria-label={t("columns.product")}
                                options={productOptions(productsQuery.data)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`lines.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                placeholder={t("qty")}
                                className="w-20"
                                {...field}
                                value={field.value as string}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`lines.${index}.unitCost`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder={t("purchases.unitCost")}
                                className="w-28"
                                {...field}
                                value={field.value as string}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("removeLine")}
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ productId: "", quantity: "1", unitCost: "" })}
                  >
                    <Plus className="mr-1 h-3 w-3" /> {t("addLine")}
                  </Button>
                </div>

                <fieldset className="space-y-2 rounded-md border p-3">
                  <legend className="px-1 text-sm font-medium">{t("purchases.supplierDocument")}</legend>
                  <div className="grid grid-cols-[6rem_1fr_9rem] gap-2">
                    <FormField
                      control={form.control}
                      name="docType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("purchases.docType")}</FormLabel>
                          <FormControl>
                            <Combobox value={field.value} onChange={(v) => v && field.onChange(v)} options={SUPPLIER_DOCUMENT_TYPES.map((d) => ({ value: d, label: d }))} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="docNo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("purchases.docNo")}</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="docDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("purchases.docDate")}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="docHash"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("purchases.docHash")}</FormLabel>
                        <FormControl>
                          <Input maxLength={4} className="w-24" placeholder="Ab3x" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </fieldset>

                <fieldset className="space-y-2 rounded-md border p-3">
                  <legend className="px-1 text-sm font-medium">{t("purchases.iva")}</legend>
                  <div className="grid grid-cols-3 gap-2">
                    <FormField
                      control={form.control}
                      name="taxRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("purchases.ivaRate")}</FormLabel>
                          <FormControl>
                            <Combobox
                              value={field.value || null}
                              onChange={(v) => field.onChange(v ?? "")}
                              clearLabel={t("purchases.noIva")}
                              placeholder={t("purchases.noIva")}
                              options={[...new Set((ratesQuery.data ?? []).filter((r) => r.active).map((r) => String(Number(r.percentage))))].map((p) => ({
                                value: p,
                                label: `${p}%`,
                                description: (ratesQuery.data ?? []).find((r) => String(Number(r.percentage)) === p)?.name,
                              }))}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="deductiblePercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("purchases.deductible")}</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} max={100} step="0.01" {...field} value={field.value as string} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="typology"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("purchases.typology")}</FormLabel>
                          <FormControl>
                            <Combobox value={field.value} onChange={(v) => v && field.onChange(v)} options={DEDUCTIBLE_TYPES.map((d) => ({ value: d, label: t(`purchases.typologies.${d}`), description: d }))} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="withholding"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("purchases.withholding")}</FormLabel>
                        <FormControl>
                          <Combobox
                            value={field.value}
                            onChange={(v) => v && field.onChange(v)}
                            options={["0", "50", "100"].map((p) => ({ value: p, label: p === "0" ? t("purchases.noWithholding") : `${p}%` }))}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </fieldset>

                <fieldset className="space-y-2 rounded-md border p-3">
                  <legend className="px-1 text-sm font-medium">{t("purchases.paidNow")}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="paidNow"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("purchases.paidAmount")}</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} step="0.01" placeholder="0" {...field} value={field.value as string} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="paidMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("purchases.paidMethod")}</FormLabel>
                          <FormControl>
                            <Combobox value={field.value} onChange={(v) => v && field.onChange(v)} options={PAYMENT_METHOD_ORDER.map((m) => ({ value: m, label: t(`common:paymentMethods.${m}`) }))} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </fieldset>

                <dl className="grid grid-cols-2 gap-x-4 text-sm" data-testid="purchase-totals">
                  <dt className="text-muted-foreground">{t("purchases.net")}</dt>
                  <dd className="text-right">{money(totals.net)}</dd>
                  <dt className="text-muted-foreground">{t("purchases.iva")}</dt>
                  <dd className="text-right">{money(totals.tax)}</dd>
                  <dt className="font-semibold">{t("columns.total")}</dt>
                  <dd className="text-right font-semibold">{money(totals.total)}</dd>
                  {totals.withheld > 0 && (
                    <>
                      <dt className="text-muted-foreground">{t("purchases.withheld")}</dt>
                      <dd className="text-right">-{money(totals.withheld)}</dd>
                      <dt className="text-muted-foreground">{t("purchases.toPay")}</dt>
                      <dd className="text-right">{money(totals.payable)}</dd>
                    </>
                  )}
                </dl>

                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("common:actions.saving") : t("purchases.submit")}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="purchases-from">{t("purchases.from")}</Label>
          <Input id="purchases-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="purchases-to">{t("purchases.to")}</Label>
          <Input id="purchases-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="purchases-supplier">{t("purchases.supplier")}</Label>
          <Combobox
            id="purchases-supplier"
            value={supplierFilter}
            onChange={setSupplierFilter}
            placeholder={t("purchases.allSuppliers")}
            clearLabel={t("purchases.allSuppliers")}
            options={(suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.name, description: s.taxId ?? undefined }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="purchases-status">{t("purchases.payment")}</Label>
          <Combobox
            id="purchases-status"
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder={t("purchases.allPayments")}
            clearLabel={t("purchases.allPayments")}
            options={(["UNPAID", "PARTIAL", "PAID"] as const).map((s) => ({ value: s, label: t(`purchases.paymentStatus.${s}`) }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="purchases-search">{t("purchases.search")}</Label>
          <Input id="purchases-search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("purchases.poNumber")}</TableHead>
                <TableHead>{t("purchases.supplier")}</TableHead>
                <TableHead>{t("purchases.docNo")}</TableHead>
                <TableHead>{t("columns.items")}</TableHead>
                <TableHead className="text-right">{t("columns.total")}</TableHead>
                <TableHead>{t("purchases.payment")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchasesQuery.data?.items.map((purchase) => (
                <TableRow key={purchase.id} className="cursor-pointer" onClick={() => setOpenId(purchase.id)}>
                  <TableCell className="font-mono text-xs">{purchase.purchaseNumber}</TableCell>
                  <TableCell>{purchase.supplier.name}</TableCell>
                  <TableCell className="text-muted-foreground">{purchase.supplierDocNo ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{purchase.lineItems.length}</TableCell>
                  <TableCell className="text-right">{money(purchase.total)}</TableCell>
                  <TableCell>
                    {purchase.paymentStatus && (
                      <Badge variant={purchase.paymentStatus === "PAID" ? "secondary" : "outline"}>{t(`purchases.paymentStatus.${purchase.paymentStatus}`)}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {purchasesQuery.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                    {t("purchases.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t("purchases.count", { count: total })}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={total === 0} onClick={() => void exportCsv()}>
            <Download className="mr-2 h-4 w-4" aria-hidden /> {t("common:actions.exportCsv")}
          </Button>
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            {t("purchases.previous")}
          </Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>
            {t("purchases.next")}
          </Button>
        </div>
      </div>
      <PurchaseDetailDialog purchaseId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
