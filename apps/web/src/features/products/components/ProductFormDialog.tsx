import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import type { ProductDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createProduct, updateProduct } from "@/features/products/api";
import { fetchCategories } from "@/features/categories/api";
import { useAuthStore } from "@/features/auth/store";

/** Radix Select can't hold an empty value, so "no category" has its own. */
const NO_CATEGORY = "none";

const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sku: z.string().trim().min(1, "SKU is required"),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  costPrice: z.coerce.number().min(0, "Must be 0 or more"),
  sellPrice: z.coerce.number().min(0, "Must be 0 or more"),
  taxRate: z.coerce.number().min(0, "Must be 0 or more"),
});
type FormInput = z.input<typeof productSchema>;
type FormOutput = z.output<typeof productSchema>;

function valuesFor(product: ProductDto | null, defaultTaxRate: string): FormInput {
  if (!product) {
    return {
      name: "",
      sku: "",
      barcode: "",
      categoryId: NO_CATEGORY,
      costPrice: "",
      sellPrice: "",
      taxRate: String(Number(defaultTaxRate)),
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
    taxRate: String(Number(product.taxRate)),
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
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  // New products start at the business's default tax rate (Settings → Money).
  const defaultTaxRate = useAuthStore((s) => s.business?.defaultTaxRate ?? "0");
  const canSeeCost = useAuthStore((s) => s.permissions?.VIEW_COST_PRICE ?? s.user?.role === "OWNER");
  const editing = product !== null;
  const showCost = editing ? "costPrice" in product : canSeeCost;

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(productSchema),
    defaultValues: valuesFor(product, defaultTaxRate),
  });
  React.useEffect(() => {
    if (open) form.reset(valuesFor(product, defaultTaxRate));
  }, [open, product, defaultTaxRate, form]);

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    onOpenChange(false);
    toast.success(message);
  };
  const onError = (error: unknown) => toast.error((error as Error).message);

  const saveMutation = useMutation({
    mutationFn: (values: FormOutput) => {
      const body = {
        name: values.name,
        sku: values.sku,
        barcode: values.barcode?.trim() ?? "",
        categoryId: values.categoryId && values.categoryId !== NO_CATEGORY ? values.categoryId : null,
        sellPrice: values.sellPrice,
        taxRate: values.taxRate,
        ...(showCost ? { costPrice: values.costPrice } : {}),
      };
      return editing
        ? updateProduct(product.id, body)
        : createProduct({ ...body, barcode: body.barcode || undefined, costPrice: values.costPrice });
    },
    onSuccess: () => done(editing ? "Product updated" : "Product created"),
    onError,
  });

  const archiveMutation = useMutation({
    mutationFn: (isActive: boolean) => updateProduct(product!.id, { isActive }),
    onSuccess: (_data, isActive) => done(isActive ? "Product restored" : "Product archived"),
    onError,
  });

  const busy = saveMutation.isPending || archiveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
          {editing && (
            <DialogDescription>
              Price changes apply to new sales. Past sales keep the price they were sold at.
            </DialogDescription>
          )}
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-3" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
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
                    <FormLabel>Barcode</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger aria-label="Category">
                        <SelectValue placeholder="Uncategorized" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
                      {categoriesQuery.data?.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className={showCost ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3"}>
              {showCost && (
                <FormField
                  control={form.control}
                  name="costPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost price</FormLabel>
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
                    <FormLabel>Sell price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} value={field.value as string} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="taxRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax %</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} value={field.value as string} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {saveMutation.isPending ? "Saving..." : editing ? "Save changes" : "Save product"}
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
                  <Archive className="h-4 w-4" /> Archive product
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={busy}
                  onClick={() => archiveMutation.mutate(true)}
                >
                  <ArchiveRestore className="h-4 w-4" /> Restore product
                </Button>
              ))}
            {editing && product.isActive && (
              <p className="text-center text-xs text-muted-foreground">
                Archiving hides it from the till and this list. Past sales and reports keep it.
              </p>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
