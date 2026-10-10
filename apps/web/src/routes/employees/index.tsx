import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import type { EmployeeDto } from "@pos/shared";
import { Badge } from "@/components/ui/badge";
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
import { createEmployee, fetchEmployees } from "@/features/employees/api";
import { CreateLoginDialog } from "@/features/users/components/CreateLoginDialog";
import { LoginFields } from "@/features/users/components/LoginFields";
import { ManageLoginDialog } from "@/features/users/components/ManageLoginDialog";
import {
  emptyLoginFields,
  roleLabel,
  toStaffLoginDto,
  validateLoginFields,
  type LoginFieldsValue,
} from "@/features/users/login-fields";
import { useAuthStore } from "@/features/auth/store";

const employeeSchema = z.object({
  firstName: z.string().min(1, "validation.required"),
  lastName: z.string().min(1, "validation.required"),
  position: z.string().optional(),
  phone: z.string().optional(),
  wage: z.string().optional(),
  email: z.string().optional(),
  storeId: z.string().optional(),
});

const defaultValues = {
  firstName: "",
  lastName: "",
  position: "",
  phone: "",
  email: "",
  wage: "",
  storeId: "",
};

export function EmployeesPage() {
  const { t } = useTranslation(["employees", "common"]);
  const queryClient = useQueryClient();
  const stores = useAuthStore((s) => s.stores);
  const isOwner = useAuthStore((s) => s.user?.role) === "OWNER";
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });
  const storeNames = React.useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);
  const defaultLoginStoreIds = stores.length === 1 ? [stores[0].id] : [];

  // `?new=1` (from the /welcome "Add a cashier" card) opens the dialog with a login ticked.
  const [searchParams, setSearchParams] = useSearchParams();
  const openedFromWelcome = isOwner && searchParams.get("new") === "1";
  const [dialogOpen, setDialogOpen] = React.useState(openedFromWelcome);
  const [canSignIn, setCanSignIn] = React.useState(openedFromWelcome);
  const [loginValue, setLoginValue] = React.useState<LoginFieldsValue>(() =>
    emptyLoginFields({ storeIds: defaultLoginStoreIds }),
  );
  const [loginError, setLoginError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (searchParams.has("new")) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const [createLoginFor, setCreateLoginFor] = React.useState<EmployeeDto | null>(null);
  const [manageLoginFor, setManageLoginFor] = React.useState<EmployeeDto | null>(null);

  const form = useForm<z.input<typeof employeeSchema>, unknown, z.output<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: z.output<typeof employeeSchema>) =>
      createEmployee({
        firstName: values.firstName,
        lastName: values.lastName,
        position: values.position || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        wage: values.wage ? Number(values.wage) : undefined,
        storeId: values.storeId || undefined,
        login: canSignIn ? toStaffLoginDto(loginValue) : undefined,
      }),
    onSuccess: (employee) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setDialogOpen(false);
      form.reset(defaultValues);
      setCanSignIn(false);
      setLoginValue(emptyLoginFields({ storeIds: defaultLoginStoreIds }));
      toast.success(
        !employee.user
          ? t("created")
          : loginValue.method === "invite"
            ? t("createdInvite", { email: employee.user.email })
            : t("createdLogin", { email: employee.user.email }),
      );
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  function toggleCanSignIn(checked: boolean) {
    setCanSignIn(checked);
    setLoginError(null);
    if (!checked) return;
    // Pre-fill from what's already typed in the employee fields.
    const { email, storeId } = form.getValues();
    setLoginValue((v) => ({
      ...v,
      email: v.email || email || "",
      storeIds: v.storeIds.length > 0 ? v.storeIds : storeId ? [storeId] : v.storeIds,
    }));
  }

  function submitEmployee(values: z.output<typeof employeeSchema>) {
    if (canSignIn) {
      const problem = validateLoginFields(loginValue);
      setLoginError(problem);
      if (problem) return;
    }
    createMutation.mutate(values);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("common:nav.employees")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> {t("new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("new")}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit(submitEmployee)}
              >
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.firstName")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.lastName")}</FormLabel>
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
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.position")}</FormLabel>
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
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.phone")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="wage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.wage")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.email")}</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="storeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.store")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("allStores")} />
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
                {isOwner && (
                  <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={canSignIn}
                        onChange={(e) => toggleCanSignIn(e.target.checked)}
                      />
                      {t("canSignIn")}
                    </label>
                    {canSignIn && (
                      <LoginFields idPrefix="new-employee" value={loginValue} onChange={setLoginValue} />
                    )}
                    {loginError && <p className="text-sm text-destructive">{loginError}</p>}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("common:actions.saving") : t("save")}
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
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("fields.position")}</TableHead>
                <TableHead>{t("columns.store")}</TableHead>
                <TableHead>{t("columns.login")}</TableHead>
                {isOwner && <TableHead className="w-0" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeesQuery.data?.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    {employee.firstName} {employee.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{employee.position ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{employee.store?.name ?? t("allStores")}</TableCell>
                  <TableCell>
                    {employee.user ? (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={employee.user.isActive ? "" : "text-muted-foreground line-through"}>
                            {employee.user.email}
                          </span>
                          <Badge variant="secondary">{roleLabel(employee.user.role)}</Badge>
                          {!employee.user.isActive && <Badge variant="destructive">{t("deactivated")}</Badge>}
                        </div>
                        {employee.user.role !== "OWNER" && (
                          <div className="text-xs text-muted-foreground">
                            {employee.user.storeIds.map((id) => storeNames.get(id) ?? t("unknownStore")).join(", ") ||
                              t("noStores")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{t("noLogin")}</span>
                    )}
                  </TableCell>
                  {isOwner && (
                    <TableCell className="text-right">
                      {employee.user ? (
                        employee.user.role !== "OWNER" && (
                          <Button variant="outline" size="sm" onClick={() => setManageLoginFor(employee)}>
                            {t("manage.button")}
                          </Button>
                        )
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setCreateLoginFor(employee)}>
                          {t("login.create")}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {employeesQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isOwner ? 5 : 4} className="p-6 text-center text-muted-foreground">
                    {t("empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isOwner && (
        <>
          <CreateLoginDialog employee={createLoginFor} onClose={() => setCreateLoginFor(null)} />
          <ManageLoginDialog employee={manageLoginFor} onClose={() => setManageLoginFor(null)} />
        </>
      )}
    </div>
  );
}
