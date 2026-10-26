import { AttachmentsButton } from "@/features/accounting/components/AttachmentsPanel";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ExpenseCategory, type ExpenseDto } from "@pos/shared";
import { Ban, Pencil, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cancelExpense, createExpense, fetchExpenses, updateExpense } from "@/features/expenses/api";
import { useAuthStore } from "@/features/auth/store";
import { useMoney } from "@/features/business/use-money";
import { formatDate } from "@/lib/format";

const expenseSchema = z.object({
  category: z.nativeEnum(ExpenseCategory),
  description: z.string().optional(),
  amount: z.coerce.number().min(0, "validation.nonNegative"),
});

const defaultValues = {
  category: ExpenseCategory.OTHER,
  description: "",
  amount: "",
};

export function ExpensesPage() {
  const { t } = useTranslation(["backoffice", "common"]);
  const money = useMoney();
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "OWNER" || role === "MANAGER";
  // The expense being corrected, "new" for a new one, null when the form is closed.
  const [editing, setEditing] = React.useState<ExpenseDto | "new" | null>(null);
  const [cancelling, setCancelling] = React.useState<ExpenseDto | null>(null);
  const [showCancelled, setShowCancelled] = React.useState(false);
  const queryClient = useQueryClient();

  const expensesQuery = useQuery({
    queryKey: ["expenses", currentStoreId, showCancelled],
    queryFn: () => fetchExpenses(currentStoreId!, showCancelled),
    enabled: !!currentStoreId,
  });

  const form = useForm<z.input<typeof expenseSchema>, unknown, z.output<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues,
  });

  React.useEffect(() => {
    if (editing === null) return;
    form.reset(
      editing === "new"
        ? defaultValues
        : { category: editing.category, description: editing.description ?? "", amount: editing.amount },
    );
  }, [editing, form]);

  const saveMutation = useMutation({
    mutationFn: (values: z.output<typeof expenseSchema>) =>
      editing && editing !== "new"
        ? updateExpense(editing.id, { category: values.category, description: (values.description || null) as string | undefined, amount: values.amount })
        : createExpense({
            storeId: currentStoreId!,
            category: values.category,
            description: values.description || undefined,
            amount: values.amount,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", currentStoreId] });
      toast.success(editing === "new" ? t("expenses.logged") : t("expenses.updated"));
      setEditing(null);
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  const total = expensesQuery.data?.filter((e) => !e.cancelledAt).reduce((sum, e) => sum + Number(e.amount), 0) ?? 0;
  const activeCount = expensesQuery.data?.filter((e) => !e.cancelledAt).length ?? 0;

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">{t("noStore")}</p>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("common:nav.expenses")}</h1>
          <p className="text-sm text-muted-foreground">
            {expensesQuery.data ? t("expenses.summary", { count: activeCount, total: money(total) }) : t("expenses.subtitle")}
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-2 h-4 w-4" /> {t("expenses.new")}
        </Button>
        <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing === "new" ? t("expenses.new") : t("expenses.edit")}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
              >
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("expenses.category")}</FormLabel>
                      <FormControl>
                        <Combobox
                          value={field.value}
                          onChange={(v) => v !== null && field.onChange(v)}
                          options={Object.values(ExpenseCategory).map((category) => ({
                            value: category,
                            label: t(`expenses.categories.${category}`),
                          }))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("expenses.amount")}</FormLabel>
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
                      <FormLabel>{t("expenses.description")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? t("common:actions.saving") : t("expenses.save")}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
        {t("expenses.showCancelled")}
      </label>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.date")}</TableHead>
                <TableHead>{t("expenses.category")}</TableHead>
                <TableHead>{t("expenses.description")}</TableHead>
                <TableHead className="text-right">{t("expenses.amount")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expensesQuery.data?.map((expense) => (
                <TableRow key={expense.id} className={expense.cancelledAt ? "text-muted-foreground" : undefined}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(expense.incurredAt)}
                  </TableCell>
                  <TableCell>
                    {t(`expenses.categories.${expense.category}`)}
                    {expense.cancelledAt && (
                      <Badge variant="secondary" className="ml-2" title={expense.cancelReason ?? undefined}>
                        {t("expenses.cancelledBadge")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{expense.description ?? "—"}</TableCell>
                  <TableCell className={`text-right ${expense.cancelledAt ? "line-through" : ""}`}>{money(expense.amount)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <AttachmentsButton ownerType="EXPENSE" ownerId={expense.id} title={`${formatDate(expense.incurredAt)} · ${money(expense.amount)}`} />
                    {canManage && !expense.cancelledAt && (
                      <>
                        {!expense.posted && (
                          <Button size="icon" variant="ghost" aria-label={t("expenses.edit")} onClick={() => setEditing(expense)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" aria-label={t("expenses.cancel")} onClick={() => setCancelling(expense)}>
                          <Ban className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {expensesQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                    {t("expenses.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CancelExpenseDialog expense={cancelling} onClose={() => setCancelling(null)} />
    </div>
  );
}

/** Cancels an expense with a reason; one already in the accounts is reversed there. */
function CancelExpenseDialog({ expense, onClose }: { expense: ExpenseDto | null; onClose: () => void }) {
  const { t } = useTranslation(["backoffice", "common"]);
  const money = useMoney();
  const queryClient = useQueryClient();
  const [reason, setReason] = React.useState("");
  React.useEffect(() => setReason(""), [expense]);

  const mutation = useMutation({
    mutationFn: () => cancelExpense(expense!.id, reason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(t("expenses.cancelled"));
      onClose();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <Dialog open={expense !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("expenses.cancelTitle", { amount: expense ? money(expense.amount) : "" })}</DialogTitle>
          <DialogDescription>{expense?.posted ? t("expenses.cancelPosted") : t("expenses.cancelExplain")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="expense-cancel-reason">{t("expenses.cancelReason")}</Label>
          <Input id="expense-cancel-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="destructive" disabled={reason.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate()}>
            {t("expenses.cancelConfirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
