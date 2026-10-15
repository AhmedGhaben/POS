import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Combobox } from "@/components/ui/combobox";
import { useAuthStore } from "@/features/auth/store";
import { countryConfig, type SupplierDto } from "@pos/shared";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createSupplier } from "@/features/suppliers/api";
import { fetchSuppliersWithBalance, SUPPLIERS_KEY } from "@/features/accounts/api";
import { SupplierAccountSheet } from "@/features/accounts/components/SupplierAccountSheet";
import { useMoney } from "@/features/business/use-money";

const supplierSchema = z.object({
  name: z.string().min(1, "validation.required"),
  contactName: z.string().optional(),
  taxId: z.union([z.literal(""), z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9 .-]*$/, "suppliers.taxIdInvalid")]).optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
});

const defaultValues = {
  name: "",
  contactName: "",
  taxId: "",
  city: "",
  province: "",
  phone: "",
  email: "",
  address: "",
};

export function SuppliersPage() {
  const { t } = useTranslation(["backoffice", "common", "accounts"]);
  const money = useMoney();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [account, setAccount] = React.useState<SupplierDto | null>(null);
  const business = useAuthStore((s) => s.business);
  const queryClient = useQueryClient();
  // With what is owed to each (docs/plans/ANGOLA.md, phase 4).
  const suppliersQuery = useQuery({ queryKey: SUPPLIERS_KEY, queryFn: fetchSuppliersWithBalance });

  const form = useForm<z.infer<typeof supplierSchema>>({
    resolver: zodResolver(supplierSchema),
    defaultValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: z.infer<typeof supplierSchema>) =>
      createSupplier({
        name: values.name,
        contactName: values.contactName || undefined,
        taxId: values.taxId || undefined,
        city: values.city || undefined,
        province: values.province || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setDialogOpen(false);
      form.reset(defaultValues);
      toast.success(t("suppliers.created"));
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("common:nav.suppliers")}</h1>
          <p className="text-sm text-muted-foreground">{t("suppliers.subtitle")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> {t("suppliers.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("suppliers.new")}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.name")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("suppliers.contactName")}</FormLabel>
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
                </div>
                <FormField
                  control={form.control}
                  name="taxId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("suppliers.taxId")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.address")}</FormLabel>
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
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("suppliers.city")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="province"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("suppliers.province")}</FormLabel>
                        <FormControl>
                          <Combobox
                            value={field.value || null}
                            onChange={(v) => field.onChange(v ?? "")}
                            clearLabel="—"
                            placeholder="—"
                            options={(countryConfig(business?.country ?? "AO")?.provinces ?? []).map((p) => ({ value: p.code, label: p.name }))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("common:actions.saving") : t("suppliers.save")}
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
                <TableHead>{t("fields.name")}</TableHead>
                <TableHead>{t("suppliers.taxId")}</TableHead>
                <TableHead>{t("suppliers.contact")}</TableHead>
                <TableHead>{t("fields.phone")}</TableHead>
                <TableHead>{t("fields.email")}</TableHead>
                <TableHead className="text-right">{t("accounts:supplierAccount.owed")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliersQuery.data?.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>{supplier.name}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.taxId ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.contactName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.email ?? "—"}</TableCell>
                  <TableCell className={`text-right ${Number(supplier.balance) > 0 ? "font-semibold" : "text-muted-foreground"}`}>{money(supplier.balance ?? 0)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setAccount(supplier)}>
                      {t("accounts:customers.account")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {suppliersQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-6 text-center text-muted-foreground">
                    {t("suppliers.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <SupplierAccountSheet supplier={account} onClose={() => setAccount(null)} />
    </div>
  );
}
