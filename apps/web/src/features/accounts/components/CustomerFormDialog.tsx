import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { countryConfig, type CustomerDto } from "@pos/shared";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";
import { createCustomer, updateCustomer } from "../api";

const NIF = /^[A-Za-z0-9][A-Za-z0-9 .-]*$/;

/** Adds or edits a customer; owners and managers also set the credit limit (empty = no credit). */
export function CustomerFormDialog({ customer, open, onOpenChange }: { customer: CustomerDto | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(["accounts", "common"]);
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const country = useAuthStore((s) => s.business?.country ?? "AO");
  const canSetLimit = role === "OWNER" || role === "MANAGER";
  const empty = { name: "", taxId: "", phone: "", email: "", address: "", city: "", province: "", creditLimit: "" };
  const [form, setForm] = React.useState(empty);
  React.useEffect(() => {
    if (!open) return;
    setForm(
      customer
        ? {
            name: customer.name,
            taxId: customer.taxId ?? "",
            phone: customer.phone ?? "",
            email: customer.email ?? "",
            address: customer.address ?? "",
            city: customer.city ?? "",
            province: customer.province ?? "",
            creditLimit: customer.creditLimit ?? "",
          }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer]);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const taxIdInvalid = form.taxId.trim() !== "" && !NIF.test(form.taxId.trim());
  const limit = form.creditLimit.trim() === "" ? null : Number(form.creditLimit);
  const limitInvalid = limit !== null && (!Number.isFinite(limit) || limit < 0);

  const save = useMutation({
    mutationFn: () => {
      const dto = {
        name: form.name.trim(),
        taxId: form.taxId.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        province: form.province || undefined,
        ...(canSetLimit ? { creditLimit: limit === null ? null : Math.round(limit * 100) / 100 } : {}),
      };
      return customer ? updateCustomer(customer.id, dto) : createCustomer(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      if (customer) void queryClient.invalidateQueries({ queryKey: ["customer-account", customer.id] });
      toast.success(customer ? t("customers.saved") : t("customers.created"));
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? t("customers.edit") : t("customers.new")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.name.trim() && !taxIdInvalid && !limitInvalid) save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="customer-name">{t("customers.name")}</Label>
            <Input id="customer-name" value={form.name} onChange={set("name")} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="customer-nif">{t("customers.taxId")}</Label>
              <Input id="customer-nif" value={form.taxId} onChange={set("taxId")} />
              {taxIdInvalid && <p className="text-xs text-destructive">{t("customers.taxIdInvalid")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-phone">{t("customers.phone")}</Label>
              <Input id="customer-phone" value={form.phone} onChange={set("phone")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-email">{t("customers.email")}</Label>
            <Input id="customer-email" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-address">{t("customers.address")}</Label>
            <Input id="customer-address" value={form.address} onChange={set("address")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="customer-city">{t("customers.city")}</Label>
              <Input id="customer-city" value={form.city} onChange={set("city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-province">{t("customers.province")}</Label>
              <Combobox
                id="customer-province"
                value={form.province || null}
                onChange={(v) => setForm((f) => ({ ...f, province: v ?? "" }))}
                clearLabel="—"
                placeholder="—"
                options={(countryConfig(country)?.provinces ?? []).map((p) => ({ value: p.code, label: p.name }))}
              />
            </div>
          </div>
          {canSetLimit && (
            <div className="space-y-1.5">
              <Label htmlFor="customer-limit">{t("customers.creditLimit")}</Label>
              <Input id="customer-limit" type="number" step="0.01" min="0" placeholder={t("customers.noCredit")} value={form.creditLimit} onChange={set("creditLimit")} />
              <p className="text-xs text-muted-foreground">{t("customers.creditLimitHint")}</p>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={!form.name.trim() || taxIdInvalid || limitInvalid || save.isPending}>
            {save.isPending ? t("common:actions.saving") : t("common:actions.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
