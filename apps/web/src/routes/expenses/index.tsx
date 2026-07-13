import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExpenseCategory } from "@pos/shared";
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
import { createExpense, fetchExpenses } from "@/features/expenses/api";
import { useAuthStore } from "@/features/auth/store";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  [ExpenseCategory.RENT]: "Rent",
  [ExpenseCategory.UTILITIES]: "Utilities",
  [ExpenseCategory.SUPPLIES]: "Supplies",
  [ExpenseCategory.PAYROLL]: "Payroll",
  [ExpenseCategory.MARKETING]: "Marketing",
  [ExpenseCategory.MAINTENANCE]: "Maintenance",
  [ExpenseCategory.OTHER]: "Other",
};

export function ExpensesPage() {
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const expensesQuery = useQuery({
    queryKey: ["expenses", currentStoreId],
    queryFn: () => fetchExpenses(currentStoreId!),
    enabled: !!currentStoreId,
  });

  const [form, setForm] = React.useState({
    category: ExpenseCategory.OTHER as ExpenseCategory,
    description: "",
    amount: "",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createExpense({
        storeId: currentStoreId!,
        category: form.category,
        description: form.description || undefined,
        amount: Number(form.amount),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", currentStoreId] });
      setDialogOpen(false);
      setForm({ category: ExpenseCategory.OTHER, description: "", amount: "" });
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
            {expensesQuery.data ? `${expensesQuery.data.length} logged · $${total.toFixed(2)} total` : "Store expenses."}
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
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ExpenseCategory).map((category) => (
                      <SelectItem key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" type="number" step="0.01" min={0} required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Input id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              {createMutation.isError && (
                <p className="text-sm text-destructive">{(createMutation.error as Error).message}</p>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save expense"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 font-medium">Description</th>
                <th className="p-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expensesQuery.data?.map((expense) => (
                <tr key={expense.id} className="border-b last:border-0">
                  <td className="p-3 text-muted-foreground">
                    {new Date(expense.incurredAt).toLocaleDateString()}
                  </td>
                  <td className="p-3">{CATEGORY_LABELS[expense.category]}</td>
                  <td className="p-3 text-muted-foreground">{expense.description ?? "—"}</td>
                  <td className="p-3 text-right">${Number(expense.amount).toFixed(2)}</td>
                </tr>
              ))}
              {expensesQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No expenses logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
