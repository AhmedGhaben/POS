import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Combobox } from "@/components/ui/combobox";
import { useAuthStore } from "@/features/auth/store";
import { countryConfig, type SupplierDto } from "@pos/shared";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createSupplier, deleteSupplier } from "@/features/suppliers/api";
import { fetchSuppliersWithBalance, SUPPLIERS_KEY, updateSupplier } from "@/features/accounts/api";
import { ApiError } from "@/lib/api-client";
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

type SupplierValues = z.infer<typeof supplierSchema>;

export function SuppliersPage() {
  const { t } = useTranslation(["backoffice", "common", "accounts"]);
  const money = useMoney();
  // The supplier being edited, "new" for a new one, null when the form is closed.
  const [editing, setEditing] = React.useState<SupplierDto | "new" | null>(null);
  const [removing, setRemoving] = React.useState<SupplierDto | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);
  const [account, setAccount] = React.useState<SupplierDto | null>(null);
  const business = useAuthStore((s) => s.business);
  const queryClient = useQueryClient();
  // With what is owed to each (docs/plans/ANGOLA.md, phase 4).
  const suppliersQuery = useQuery({ queryKey: [...SUPPLIERS_KEY, showArchived], queryFn: () => fetchSuppliersWithBalance(showArchived) });

  const form = useForm<SupplierValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues,
  });

  React.useEffect(() => {
    if (editing === null) return;
    form.reset(
      editing === "new"
        ? defaultValues
        : {
            name: editing.name,
            contactName: editing.contactName ?? "",
            taxId: editing.taxId ?? "",
            city: editing.city ?? "",
            province: editing.province ?? "",
            phone: editing.phone ?? "",
            email: editing.email ?? "",
            address: editing.address ?? "",
          },
    );
  }, [editing, form]);

  const saveMutation = useMutation({
    mutationFn: (values: SupplierValues) => {
      if (editing && editing !== "new") {
        // Emptied fields are cleared.
        const clear = (v: string | undefined) => (v ? v : null) as string | undefined;
        return updateSupplier(editing.id, {
          name: values.name,
          contactName: clear(values.contactName),
          taxId: clear(values.taxId),
          city: clear(values.city),
          province: clear(values.province),
          phone: clear(values.phone),
          email: clear(values.email),
          address: clear(values.address),
        });
      }
      return createSupplier({
        name: values.name,
        contactName: values.contactName || undefined,
        taxId: values.taxId || undefined,
        city: values.city || undefined,
        province: values.province || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(editing === "new" ? t("suppliers.created") : t("suppliers.updated"));
      setEditing(null);
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateSupplier(id, { isActive }),
    onSuccess: (_data, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(isActive ? t("suppliers.restored") : t("suppliers.archived"));
      setRemoving(null);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("common:nav.suppliers")}</h1>
          <p className="text-sm text-muted-foreground">{t("suppliers.subtitle")}</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-2 h-4 w-4" /> {t("suppliers.new")}
        </Button>
        <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing === "new" ? t("suppliers.new") : t("suppliers.edit")}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                className="space-y-3"
                onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
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
                <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? t("common:actions.saving") : t("suppliers.save")}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        {t("suppliers.showArchived")}
      </label>

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
                  <TableCell>
                    {supplier.name}
                    {supplier.isActive === false && (
                      <Badge variant="secondary" className="ml-2">
                        {t("suppliers.archivedBadge")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{supplier.taxId ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.contactName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.email ?? "—"}</TableCell>
                  <TableCell className={`text-right ${Number(supplier.balance) > 0 ? "font-semibold" : "text-muted-foreground"}`}>{money(supplier.balance ?? 0)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setAccount(supplier)}>
                      {t("accounts:customers.account")}
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={t("suppliers.editFor", { name: supplier.name })} onClick={() => setEditing(supplier)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {supplier.isActive === false ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t("suppliers.restoreFor", { name: supplier.name })}
                        disabled={archiveMutation.isPending}
                        onClick={() => archiveMutation.mutate({ id: supplier.id, isActive: true })}
                      >
                        <ArchiveRestore className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button size="icon" variant="ghost" aria-label={t("suppliers.removeFor", { name: supplier.name })} onClick={() => setRemoving(supplier)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
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
      <RemoveSupplierDialog
        supplier={removing}
        onClose={() => setRemoving(null)}
        onArchive={(id) => archiveMutation.mutate({ id, isActive: false })}
        archiving={archiveMutation.isPending}
      />
    </div>
  );
}

/**
 * Deletes a supplier with no purchases or payments. One with history can't
 * be deleted (reports and SAF-T need it): the dialog then offers to archive it.
 */
function RemoveSupplierDialog({
  supplier,
  onClose,
  onArchive,
  archiving,
}: {
  supplier: SupplierDto | null;
  onClose: () => void;
  onArchive: (id: string) => void;
  archiving: boolean;
}) {
  const { t } = useTranslation(["backoffice", "common"]);
  const queryClient = useQueryClient();
  const [hasHistory, setHasHistory] = React.useState(false);
  React.useEffect(() => setHasHistory(false), [supplier]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(t("suppliers.deleted"));
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) setHasHistory(true);
      else toast.error((error as Error).message);
    },
  });

  return (
    <Dialog open={supplier !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("suppliers.removeTitle", { name: supplier?.name ?? "" })}</DialogTitle>
          <DialogDescription>{hasHistory ? t("suppliers.hasHistory") : t("suppliers.removeExplain")}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          {hasHistory ? (
            <Button disabled={archiving} onClick={() => supplier && onArchive(supplier.id)}>
              <Archive className="mr-2 h-4 w-4" /> {t("suppliers.archive")}
            </Button>
          ) : (
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => supplier && deleteMutation.mutate(supplier.id)}>
              <Trash2 className="mr-2 h-4 w-4" /> {t("suppliers.delete")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
