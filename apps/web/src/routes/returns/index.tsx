import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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

const returnLineSchema = z
  .object({
    productId: z.string(),
    productName: z.string(),
    maxQuantity: z.number(),
    quantity: z.coerce.number().min(0, "Must be 0 or more"),
  })
  .refine((line) => line.quantity <= line.maxQuantity, {
    message: "Cannot exceed the sold quantity",
    path: ["quantity"],
  });

const returnSchema = z.object({
  saleId: z.string().min(1, "Select a sale"),
  reason: z.string().optional(),
  lines: z.array(returnLineSchema),
});

const defaultValues: z.input<typeof returnSchema> = {
  saleId: "",
  reason: "",
  lines: [],
};

export function ReturnsPage() {
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
      toast.success("Return processed");
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">No store selected.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Returns</h1>
          <p className="text-sm text-muted-foreground">Process refunds against a past sale.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New return
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New return</DialogTitle>
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
                      <FormLabel>Sale</FormLabel>
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
                            <SelectValue placeholder="Select a recent sale" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {salesQuery.data?.map((sale) => (
                            <SelectItem key={sale.id} value={sale.id}>
                              {sale.receiptNumber} — ${Number(sale.total).toFixed(2)}
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
                    <Label>Items to return</Label>
                    {fields.map((line, index) => (
                      <div key={line.id} className="flex items-center gap-2">
                        <span className="flex-1 text-sm">
                          {line.productName}{" "}
                          <span className="text-muted-foreground">(sold {line.maxQuantity})</span>
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
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Processing..." : "Process return"}
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
                <TableHead>Date</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Refund</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returnsQuery.data?.map((ret) => (
                <TableRow key={ret.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(ret.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{ret.lineItems.length}</TableCell>
                  <TableCell className="text-muted-foreground">{ret.reason ?? "—"}</TableCell>
                  <TableCell className="text-right">${Number(ret.totalRefund).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {returnsQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="p-6 text-center text-muted-foreground">
                    No returns processed yet.
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
