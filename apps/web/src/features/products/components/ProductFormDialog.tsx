import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, Archive, ArchiveRestore, ImagePlus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { activeExemptions, countryConfig, ratesForStore, UNITS, type ProductDto, type SaftProductType } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  createProduct,
  deleteProduct,
  findProductByBarcode,
  productPhotoSrc,
  removeProductPhoto,
  updateProduct,
  uploadProductPhoto,
} from "@/features/products/api";
import { fetchCategories } from "@/features/categories/api";
import { ApiError } from "@/lib/api-client";
import { fetchTaxRates, TAX_RATES_QUERY_KEY } from "@/features/business/api";
import { resizePhoto } from "@/features/business/resize-logo";
import { useAuthStore } from "@/features/auth/store";
import { choiceValue, currentTaxChoice, EXEMPT, LEGACY, taxPayload, type TaxChoice } from "@/features/products/product-tax";

/** The combobox can't hold an empty value, so "no category" has its own. */
const NO_CATEGORY = "none";

const productSchema = z
  .object({
    name: z.string().trim().min(1, "validation.required"),
    sku: z.string().trim().min(1, "validation.required"),
    barcode: z.string().optional(),
    categoryId: z.string().optional(),
    costPrice: z.coerce.number().min(0, "validation.nonNegative"),
    sellPrice: z.coerce.number().min(0, "validation.nonNegative"),
    /** A tax rate id, EXEMPT or LEGACY. */
    tax: z.string().min(1, "validation.required"),
    exemptionCode: z.string().optional(),
    unit: z.string(),
    productType: z.string(),
    inventoryType: z.string().optional(),
    trackStock: z.boolean(),
  })
  // Exempt needs the reason that goes on the documents.
  .refine((v) => v.tax !== EXEMPT || !!v.exemptionCode, { message: "products:form.exemptionReasonRequired", path: ["exemptionCode"] });
type FormInput = z.input<typeof productSchema>;
type FormOutput = z.output<typeof productSchema>;

function valuesFor(product: ProductDto | null, tax: TaxChoice | null): FormInput {
  if (!product) {
    return {
      name: "",
      sku: "",
      barcode: "",
      categoryId: NO_CATEGORY,
      costPrice: "",
      sellPrice: "",
      tax: choiceValue(tax) ?? "",
      exemptionCode: "",
      unit: "un",
      productType: "P",
      inventoryType: "M",
      trackStock: true,
    };
  }
  return {
    name: product.name,
    sku: product.sku,
    barcode: product.barcode ?? "",
    categoryId: product.categoryId ?? NO_CATEGORY,
    // Users who can't see costs never get the field (it's hidden and not sent).
    costPrice: "costPrice" in product ? String(Number(product.costPrice)) : "0",
    sellPrice: String(Number(product.sellPrice)),
    tax: choiceValue(tax) ?? "",
    exemptionCode: product.exemptionCode ?? "",
    unit: product.unit ?? "un",
    productType: product.productType ?? (product.trackStock === false ? "S" : "P"),
    inventoryType: product.inventoryType ?? "",
    trackStock: product.trackStock ?? true,
  };
}

/**
 * Create a product (`product` null) or edit one. Editing also archives an
 * active product or restores an archived one. A new price applies to sales
 * from now on; past sales keep what they were charged.
 */
export function ProductFormDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDto | null;
}) {
  const { t } = useTranslation(["products", "common"]);
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const ratesQuery = useQuery({ queryKey: TAX_RATES_QUERY_KEY, queryFn: fetchTaxRates });
  const business = useAuthStore((s) => s.business);
  const stores = useAuthStore((s) => s.stores);
  const canSeeCost = useAuthStore((s) => s.permissions?.VIEW_COST_PRICE ?? s.user?.role === "OWNER");
  const editing = product !== null;
  const showCost = editing ? "costPrice" in product : canSeeCost;
  const config = countryConfig(business?.country ?? "AO");
  // Shelf prices with IVA in (most stores) or without it.
  const pricesIncludeTax = stores.some((s) => s.pricesIncludeTax);

  // The regional rate (Cabinda) is only offered when a store is there.
  const rates = React.useMemo(() => {
    const all = (ratesQuery.data ?? []).filter((r) => r.active || r.id === product?.taxRateId);
    if (!config) return all;
    const regional = all.filter((r) => r.region !== config.code);
    const local = stores.flatMap((s) => ratesForStore(config, all, s.province));
    return all.filter((r) => local.includes(r) || (r.id === product?.taxRateId && regional.includes(r)));
  }, [ratesQuery.data, config, stores, product?.taxRateId]);
  const initialTax = React.useMemo(() => currentTaxChoice(product, ratesQuery.data ?? []), [product, ratesQuery.data]);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(productSchema),
    defaultValues: valuesFor(product, initialTax),
  });
  // Fresh values each time the dialog opens; the tax rates may arrive a
  // moment later, so their default fills an empty tax field without
  // touching anything already typed.
  const currentTaxChoiceRef = React.useRef(initialTax);
  currentTaxChoiceRef.current = initialTax;
  React.useEffect(() => {
    if (open) form.reset(valuesFor(product, currentTaxChoiceRef.current));
  }, [open, product, form]);
  React.useEffect(() => {
    if (open && initialTax && !form.getValues("tax")) form.setValue("tax", choiceValue(initialTax) ?? "");
  }, [open, initialTax, form]);

  // A picked photo waits for the save (a new product has no id yet).
  const [photo, setPhoto] = React.useState<{ dataUrl: string } | "remove" | null>(null);
  React.useEffect(() => {
    if (open) setPhoto(null);
  }, [open]);
  // Deleting for good: asked to confirm first; refused when the product has history.
  const [deleteStep, setDeleteStep] = React.useState<"idle" | "confirm" | "hasHistory">("idle");
  React.useEffect(() => {
    if (open) setDeleteStep("idle");
  }, [open]);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Barcodes are unique among active products: warn while typing (the server checks too).
  const barcode = (form.watch("barcode") ?? "").trim();
  const [debouncedBarcode, setDebouncedBarcode] = React.useState("");
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedBarcode(barcode), 300);
    return () => clearTimeout(id);
  }, [barcode]);
  const barcodeQuery = useQuery({
    queryKey: ["barcode-check", debouncedBarcode],
    queryFn: () => findProductByBarcode(debouncedBarcode),
    enabled: open && debouncedBarcode.length > 0 && debouncedBarcode !== (product?.barcode ?? ""),
  });
  const barcodeOwner = barcodeQuery.data && barcodeQuery.data.id !== product?.id ? barcodeQuery.data : null;

  const tax = form.watch("tax");
  const trackStock = form.watch("trackStock");
  const unit = form.watch("unit");

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    // A new or restored product shows in the inventory at 0.
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.removeQueries({ queryKey: ["barcode-check"] });
    onOpenChange(false);
    toast.success(message);
  };
  const onError = (error: unknown) => toast.error((error as Error).message);

  const saveMutation = useMutation({
    mutationFn: async (values: FormOutput) => {
      const choice: TaxChoice | null =
        values.tax === EXEMPT ? { kind: "exempt" } : values.tax === LEGACY ? initialTax : { kind: "rate", id: values.tax };
      const body = {
        name: values.name,
        sku: values.sku,
        barcode: values.barcode?.trim() ?? "",
        categoryId: values.categoryId && values.categoryId !== NO_CATEGORY ? values.categoryId : null,
        sellPrice: values.sellPrice,
        ...taxPayload(choice, values.exemptionCode || null),
        unit: values.unit,
        productType: values.productType as SaftProductType,
        inventoryType: values.trackStock ? values.inventoryType || null : null,
        trackStock: values.trackStock,
        ...(showCost ? { costPrice: values.costPrice } : {}),
      };
      const saved = editing
        ? await updateProduct(product.id, body)
        : await createProduct({ ...body, barcode: body.barcode || undefined, costPrice: values.costPrice });
      if (photo === "remove") await removeProductPhoto(saved.id);
      else if (photo) await uploadProductPhoto(saved.id, photo.dataUrl);
      return saved;
    },
    onSuccess: () => done(editing ? t("form.updated") : t("form.created")),
    onError,
  });

  const archiveMutation = useMutation({
    mutationFn: (isActive: boolean) => updateProduct(product!.id, { isActive }),
    onSuccess: (_data, isActive) => done(isActive ? t("form.restored") : t("form.archived")),
    onError,
  });

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto({ dataUrl: await resizePhoto(file) });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(product!.id),
    onSuccess: () => done(t("form.deleted")),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) setDeleteStep("hasHistory");
      else onError(error);
    },
  });

  const busy = saveMutation.isPending || archiveMutation.isPending || deleteMutation.isPending;
  const photoSrc = photo === "remove" ? null : photo ? photo.dataUrl : product ? productPhotoSrc(product) : null;
  const taxOptions = [
    ...rates.map((r) => ({
      value: r.id,
      label: r.name,
      description: `${Number(r.percentage)}%${r.verifyValidity ? ` · ${t("form.verifyRate")}` : ""}`,
      keywords: [r.taxCode],
    })),
    ...(initialTax?.kind === "legacy" ? [{ value: LEGACY, label: t("form.legacyRate", { rate: initialTax.rate }), description: t("form.legacyRateHint") }] : []),
    { value: EXEMPT, label: t("form.exempt"), description: "0%", keywords: ["isento", "ISE"] },
  ];
  const exemptions = config ? activeExemptions(config) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("form.editTitle") : t("newProduct")}</DialogTitle>
          {editing && <DialogDescription>{t("form.priceNote")}</DialogDescription>}
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-3" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <div className="flex gap-3">
              <div className="flex shrink-0 flex-col items-center gap-1">
                <button
                  type="button"
                  className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground hover:bg-muted/70"
                  aria-label={photoSrc ? t("form.changePhoto") : t("form.addPhoto")}
                  onClick={() => fileRef.current?.click()}
                >
                  {photoSrc ? <img src={photoSrc} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
                </button>
                {photoSrc && (
                  <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setPhoto("remove")}>
                    <Trash2 className="mr-0.5 inline h-3 w-3" />
                    {t("form.removePhoto")}
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  data-testid="product-photo-input"
                  onChange={(e) => {
                    void pickPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>{t("columns.name")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("columns.sku")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="barcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("columns.barcode")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        inputMode="numeric"
                        placeholder={t("form.barcodePlaceholder")}
                        // A scanner types the code and presses Enter: that must not save the form.
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.preventDefault();
                        }}
                      />
                    </FormControl>
                    {barcodeOwner && (
                      <p className="flex items-center gap-1 text-xs text-destructive" role="alert">
                        <AlertTriangle className="h-3 w-3" /> {t("form.barcodeTaken", { name: barcodeOwner.name })}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("columns.category")}</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value === NO_CATEGORY ? null : field.value}
                        onChange={(v) => field.onChange(v ?? NO_CATEGORY)}
                        aria-label={t("columns.category")}
                        placeholder={t("form.uncategorized")}
                        clearLabel={t("form.uncategorized")}
                        options={(categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.unit")}</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onChange={(v) => v && field.onChange(v)}
                        aria-label={t("form.unit")}
                        options={UNITS.map((u) => ({ value: u.code, label: t(`units.${u.code}`), description: u.code }))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className={showCost ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
              {showCost && (
                <FormField
                  control={form.control}
                  name="costPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("columns.costPrice")}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value as string} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="sellPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {unit !== "un" ? t("form.pricePer", { unit }) : t("columns.sellPrice")}
                    </FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} value={field.value as string} />
                    </FormControl>
                    <FormDescription>{pricesIncludeTax ? t("form.priceWithTax") : t("form.priceWithoutTax")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="tax"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.tax")}</FormLabel>
                    <FormControl>
                      <Combobox value={field.value || null} onChange={(v) => v && field.onChange(v)} aria-label={t("form.tax")} options={taxOptions} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {tax === EXEMPT && (
                <FormField
                  control={form.control}
                  name="exemptionCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.exemptionReason")}</FormLabel>
                      <FormControl>
                        <Combobox
                          value={field.value || null}
                          onChange={(v) => field.onChange(v ?? "")}
                          aria-label={t("form.exemptionReason")}
                          placeholder={t("form.chooseReason")}
                          options={exemptions.map((e) => ({ value: e.code, label: e.label, description: e.code, keywords: [e.legalText, e.description] }))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="productType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.productType")}</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onChange={(v) => v && field.onChange(v)}
                        aria-label={t("form.productType")}
                        options={(config?.productTypes ?? []).map((p) => ({ value: p.code, label: p.name, description: p.code }))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {trackStock && (
                <FormField
                  control={form.control}
                  name="inventoryType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.inventoryType")}</FormLabel>
                      <FormControl>
                        <Combobox
                          value={field.value || null}
                          onChange={(v) => field.onChange(v ?? "")}
                          aria-label={t("form.inventoryType")}
                          options={(config?.inventoryTypes ?? []).map((p) => ({ value: p.code, label: p.name, description: p.code }))}
                        />
                      </FormControl>
                      {config?.inventoryTypesDraft && <FormDescription>{t("form.inventoryTypeDraft")}</FormDescription>}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            <FormField
              control={form.control}
              name="trackStock"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-start gap-3">
                    <FormControl>
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={field.value}
                        onChange={(e) => {
                          field.onChange(e.target.checked);
                          // Services: no stock, SAF-T type S, no inventory type.
                          if (!e.target.checked && form.getValues("productType") === "P") form.setValue("productType", "S");
                          if (e.target.checked && form.getValues("productType") === "S") form.setValue("productType", "P");
                          if (e.target.checked && !form.getValues("inventoryType")) form.setValue("inventoryType", "M");
                        }}
                      />
                    </FormControl>
                    <div>
                      <FormLabel>{t("form.trackStock")}</FormLabel>
                      <FormDescription>{t("form.trackStockHint")}</FormDescription>
                    </div>
                  </div>
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={busy}>
              {saveMutation.isPending ? t("common:actions.saving") : editing ? t("common:actions.saveChanges") : t("form.save")}
            </Button>
            {editing &&
              (product.isActive ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full gap-2 text-muted-foreground"
                  disabled={busy}
                  onClick={() => archiveMutation.mutate(false)}
                >
                  <Archive className="h-4 w-4" /> {t("form.archive")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={busy}
                  onClick={() => archiveMutation.mutate(true)}
                >
                  <ArchiveRestore className="h-4 w-4" /> {t("form.restore")}
                </Button>
              ))}
            {editing && product.isActive && (
              <p className="text-center text-xs text-muted-foreground">
                {t("form.archiveNote")}
              </p>
            )}
            {editing && deleteStep === "idle" && (
              <Button type="button" variant="ghost" size="sm" className="w-full gap-2 text-destructive" disabled={busy} onClick={() => setDeleteStep("confirm")}>
                <Trash2 className="h-4 w-4" /> {t("form.delete")}
              </Button>
            )}
            {editing && deleteStep === "confirm" && (
              <div className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
                <p>{t("form.deleteConfirm", { name: product.name })}</p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setDeleteStep("idle")}>
                    {t("common:actions.cancel")}
                  </Button>
                  <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => deleteMutation.mutate()}>
                    {t("form.deleteForGood")}
                  </Button>
                </div>
              </div>
            )}
            {editing && deleteStep === "hasHistory" && (
              <p className="rounded-md border p-3 text-sm text-muted-foreground">
                {product.isActive ? t("form.hasHistory") : t("form.hasHistoryArchived")}
              </p>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
