import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { createReturn, fetchReturns } from "@/features/returns/api";
import { fetchSalesByStore } from "@/features/sales/api";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";
import { formatDate } from "@/lib/format";

const returnLineSchema = z
  .object({
    productId: z.string(),
    productName: z.string(),
    maxQuantity: z.number(),
    quantity: z.coerce.number().min(0, "validation.nonNegative"),
  })
  .refine((line) => line.quantity <= line.maxQuantity, {
    message: "stock:returns.overSold",
    path: ["quantity"],
  });

const returnSchema = z.object({
  saleId: z.string().min(1, "validation.required"),
  reason: z.string().optional(),
  lines: z.array(returnLineSchema),
});

const defaultValues: z.input<typeof returnSchema> = {
  saleId: "",
  reason: "",
  lines: [],
};

export function ReturnsPage() {
  const { t } = useTranslation(["stock", "common"]);
  const money = useMoney();
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

  const form = useForm<z.input<typeof returnSchema>, unknown, z.output<typeof returnSchema>>({
    resolver: zodResolver(returnSchema),
    defaultValues,
  });
  const { fields, replace } = useFieldArray({ control: form.control, name: "lines" });

  const createMutation = useMutation({
    mutationFn: (values: z.output<typeof returnSchema>) =>
      createReturn({
        storeId: currentStoreId!,
        saleId: values.saleId,
        reason: values.reason || undefined,
        lineItems: values.lines
          .filter((l) => l.quantity > 0)
          .map((l) => ({ productId: l.productId, quantity: l.quantity })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns", currentStoreId] });
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
      setDialogOpen(false);
      form.reset(defaultValues);
      toast.success(t("returns.done"));
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
          <h1 className="text-2xl font-semibold">{t("common:nav.returns")}</h1>
          <p className="text-sm text-muted-foreground">{t("returns.subtitle")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> {t("returns.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("returns.new")}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
              >
                <FormField
                  control={form.control}
                  name="saleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("returns.sale")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          const sale = salesQuery.data?.find((s) => s.id === v);
                          replace(
                            sale?.lineItems.map((li) => ({
                              productId: li.productId,
                              productName: li.product.name,
                              maxQuantity: li.quantity,
                              quantity: "0",
                            })) ?? [],
                          );
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("returns.selectSale")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {salesQuery.data?.map((sale) => (
                            <SelectItem key={sale.id} value={sale.id}>
                              {sale.receiptNumber} — {money(sale.total)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {fields.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t("returns.itemsToReturn")}</Label>
                    {fields.map((line, index) => (
                      <div key={line.id} className="flex items-center gap-2">
                        <span className="flex-1 text-sm">
                          {line.productName}{" "}
                          <span className="text-muted-foreground">{t("returns.sold", { count: line.maxQuantity })}</span>
                        </span>
                        <FormField
                          control={form.control}
                          name={`lines.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  max={line.maxQuantity}
                                  className="w-20"
                                  {...field}
                                  value={field.value as string}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("returns.reason")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("returns.submitting") : t("returns.submit")}
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
                <TableHead>{t("columns.date")}</TableHead>
                <TableHead>{t("columns.items")}</TableHead>
                <TableHead>{t("returns.reason")}</TableHead>
                <TableHead className="text-right">{t("returns.refund")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returnsQuery.data?.map((ret) => (
                <TableRow key={ret.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(ret.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{ret.lineItems.length}</TableCell>
                  <TableCell className="text-muted-foreground">{ret.reason ?? "—"}</TableCell>
                  <TableCell className="text-right">{money(ret.totalRefund)}</TableCell>
                </TableRow>
              ))}
              {returnsQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="p-6 text-center text-muted-foreground">
                    {t("returns.empty")}
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
