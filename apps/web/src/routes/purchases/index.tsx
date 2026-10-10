import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createPurchase, fetchPurchases } from "@/features/purchases/api";
import { fetchSuppliers } from "@/features/suppliers/api";
import { fetchProducts } from "@/features/products/api";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";

const lineSchema = z.object({
  productId: z.string().min(1, "validation.required"),
  quantity: z.coerce.number().int("validation.wholeNumber").min(1, "validation.atLeast1"),
  unitCost: z.coerce.number().min(0, "validation.nonNegative"),
});

const purchaseSchema = z.object({
  supplierId: z.string().min(1, "validation.required"),
  lines: z.array(lineSchema).min(1, "validation.addLine"),
});

const defaultValues = {
  supplierId: "",
  lines: [{ productId: "", quantity: "1", unitCost: "" }],
};

export function PurchasesPage() {
  const { t } = useTranslation(["stock", "common"]);
  const money = useMoney();
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const purchasesQuery = useQuery({
    queryKey: ["purchases", currentStoreId],
    queryFn: () => fetchPurchases(currentStoreId!),
    enabled: !!currentStoreId,
  });
  const suppliersQuery = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });

  const form = useForm<z.input<typeof purchaseSchema>, unknown, z.output<typeof purchaseSchema>>({
    resolver: zodResolver(purchaseSchema),
    defaultValues,
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });

  const createMutation = useMutation({
    mutationFn: (values: z.output<typeof purchaseSchema>) =>
      createPurchase({
        storeId: currentStoreId!,
        supplierId: values.supplierId,
        lineItems: values.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases", currentStoreId] });
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
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
    <div className="mx-auto max-w-4xl p-6">
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
          <DialogContent className="max-w-lg">
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
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("purchases.selectSupplier")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suppliersQuery.data?.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t("columns.product")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {productsQuery.data?.map((product) => (
                                  <SelectItem key={product.id} value={product.id}>
                                    {product.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
                                min={1}
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

                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("common:actions.saving") : t("purchases.submit")}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("purchases.poNumber")}</TableHead>
                <TableHead>{t("purchases.supplier")}</TableHead>
                <TableHead>{t("columns.items")}</TableHead>
                <TableHead className="text-right">{t("columns.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchasesQuery.data?.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell className="font-mono text-xs">{purchase.purchaseNumber}</TableCell>
                  <TableCell>{purchase.supplier.name}</TableCell>
                  <TableCell className="text-muted-foreground">{purchase.lineItems.length}</TableCell>
                  <TableCell className="text-right">{money(purchase.total)}</TableCell>
                </TableRow>
              ))}
              {purchasesQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="p-6 text-center text-muted-foreground">
                    {t("purchases.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
