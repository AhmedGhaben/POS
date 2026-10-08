import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ExpenseCategory } from "@pos/shared";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { createExpense, fetchExpenses } from "@/features/expenses/api";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  [ExpenseCategory.RENT]: "Rent",
  [ExpenseCategory.UTILITIES]: "Utilities",
  [ExpenseCategory.SUPPLIES]: "Supplies",
  [ExpenseCategory.PAYROLL]: "Payroll",
  [ExpenseCategory.MARKETING]: "Marketing",
  [ExpenseCategory.MAINTENANCE]: "Maintenance",
  [ExpenseCategory.OTHER]: "Other",
};

const expenseSchema = z.object({
  category: z.nativeEnum(ExpenseCategory),
  description: z.string().optional(),
  amount: z.coerce.number().min(0, "Must be 0 or more"),
});

const defaultValues = {
  category: ExpenseCategory.OTHER,
  description: "",
  amount: "",
};

export function ExpensesPage() {
  const money = useMoney();
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const expensesQuery = useQuery({
    queryKey: ["expenses", currentStoreId],
    queryFn: () => fetchExpenses(currentStoreId!),
    enabled: !!currentStoreId,
  });

  const form = useForm<z.input<typeof expenseSchema>, unknown, z.output<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: z.output<typeof expenseSchema>) =>
      createExpense({
        storeId: currentStoreId!,
        category: values.category,
        description: values.description || undefined,
        amount: values.amount,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", currentStoreId] });
      setDialogOpen(false);
      form.reset(defaultValues);
      toast.success("Expense logged");
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  const total = expensesQuery.data?.reduce((sum, e) => sum + Number(e.amount), 0) ?? 0;

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">No store selected.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            {expensesQuery.data ? `${expensesQuery.data.length} logged · ${money(total)} total` : "Store expenses."}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Log expense
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log expense</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
              >
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(ExpenseCategory).map((category) => (
                            <SelectItem key={category} value={category}>
                              {CATEGORY_LABELS[category]}
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
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min={0} {...field} value={field.value as string} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Saving..." : "Save expense"}
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
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expensesQuery.data?.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(expense.incurredAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{CATEGORY_LABELS[expense.category]}</TableCell>
                  <TableCell className="text-muted-foreground">{expense.description ?? "—"}</TableCell>
                  <TableCell className="text-right">{money(expense.amount)}</TableCell>
                </TableRow>
              ))}
              {expensesQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="p-6 text-center text-muted-foreground">
                    No expenses logged yet.
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
