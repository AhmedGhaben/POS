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
import { createTransfer, fetchTransfers } from "@/features/transfers/api";
import { fetchProducts } from "@/features/products/api";
import { useAuthStore } from "@/features/auth/store";
import { formatDate } from "@/lib/format";

const transferLineSchema = z.object({
  productId: z.string().min(1, "validation.required"),
  quantity: z.coerce.number().int("validation.wholeNumber").min(1, "validation.atLeast1"),
});

const transferSchema = z
  .object({
    fromStoreId: z.string().min(1, "validation.required"),
    toStoreId: z.string().min(1, "validation.required"),
    note: z.string().optional(),
    lines: z.array(transferLineSchema).min(1, "validation.addLine"),
  })
  .refine((data) => data.fromStoreId !== data.toStoreId, {
    message: "stock:transfers.sameStore",
    path: ["toStoreId"],
  });

const defaultValues = {
  fromStoreId: "",
  toStoreId: "",
  note: "",
  lines: [{ productId: "", quantity: "1" }],
};

export function TransfersPage() {
  const { t } = useTranslation(["stock", "common"]);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const stores = useAuthStore((s) => s.stores);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const transfersQuery = useQuery({
    queryKey: ["transfers", currentStoreId],
    queryFn: () => fetchTransfers(currentStoreId!),
    enabled: !!currentStoreId,
  });
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });

  const form = useForm<z.input<typeof transferSchema>, unknown, z.output<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues,
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const fromStoreId = form.watch("fromStoreId");

  const createMutation = useMutation({
    mutationFn: (values: z.output<typeof transferSchema>) =>
      createTransfer({
        fromStoreId: values.fromStoreId,
        toStoreId: values.toStoreId,
        note: values.note || undefined,
        lineItems: values.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers", currentStoreId] });
      queryClient.invalidateQueries({ queryKey: ["inventory", currentStoreId] });
      setDialogOpen(false);
      form.reset(defaultValues);
      toast.success(t("transfers.done"));
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
          <h1 className="text-2xl font-semibold">{t("transfers.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("transfers.subtitle")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> {t("transfers.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("transfers.new")}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
              >
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="fromStoreId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("transfers.fromStore")}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("transfers.source")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {stores.map((store) => (
                              <SelectItem key={store.id} value={store.id}>
                                {store.name}
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
                    name="toStoreId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("transfers.toStore")}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("transfers.destination")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {stores
                              .filter((store) => store.id !== fromStoreId)
                              .map((store) => (
                                <SelectItem key={store.id} value={store.id}>
                                  {store.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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
                    onClick={() => append({ productId: "", quantity: "1" })}
                  >
                    <Plus className="mr-1 h-3 w-3" /> {t("addLine")}
                  </Button>
                </div>

                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("noteOptional")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("transfers.submitting") : t("transfers.submit")}
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
                <TableHead>{t("transfers.from")}</TableHead>
                <TableHead>{t("transfers.to")}</TableHead>
                <TableHead>{t("columns.items")}</TableHead>
                <TableHead>{t("columns.note")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfersQuery.data?.map((transfer) => (
                <TableRow key={transfer.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(transfer.createdAt)}
                  </TableCell>
                  <TableCell>{transfer.fromStore.name}</TableCell>
                  <TableCell>{transfer.toStore.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {transfer.lineItems.map((li) => `${li.quantity} × ${li.product.name}`).join(", ")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{transfer.note ?? "—"}</TableCell>
                </TableRow>
              ))}
              {transfersQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                    {t("transfers.empty")}
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
