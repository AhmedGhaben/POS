import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { countryConfig, type IvaRegime, type StoreDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthStore } from "@/features/auth/store";
import { updateStore } from "@/features/business/api";

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface StoreForm {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  phone: string;
  timezone: string;
  ivaRegime: IvaRegime;
  pricesIncludeTax: boolean;
}

function EditStoreDialog({ store, onClose }: { store: StoreDto | null; onClose: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const updateCached = useAuthStore((s) => s.updateStore);
  const country = countryConfig(store?.country ?? "AO");
  const [form, setForm] = React.useState<StoreForm | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!store) return;
    setForm({
      name: store.name,
      address: store.address ?? "",
      city: store.city ?? "",
      postalCode: store.postalCode ?? "",
      province: store.province ?? "",
      phone: store.phone ?? "",
      timezone: store.timezone,
      ivaRegime: store.ivaRegime ?? "GERAL",
      pricesIncludeTax: store.pricesIncludeTax ?? true,
    });
    setError(null);
  }, [store]);

  const mutation = useMutation({
    mutationFn: () => updateStore(store!.id, { ...form!, province: form!.province || null }),
    onSuccess: (updated) => {
      updateCached(updated);
      toast.success(t("stores.updated"));
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim()) return setError(t("stores.nameRequired"));
    if (!isValidTimezone(form.timezone)) return setError(t("stores.badTimezone"));
    setError(null);
    mutation.mutate();
  }

  const set = (key: "name" | "address" | "city" | "postalCode" | "phone" | "timezone") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f));
  const regimeChanged = !!store && !!form && form.ivaRegime !== (store.ivaRegime ?? "GERAL");

  return (
    <Dialog open={!!store} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("stores.edit")}</DialogTitle>
        </DialogHeader>
        {form && (
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="store-name">{t("stores.name")}</Label>
              <Input id="store-name" value={form.name} onChange={set("name")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-address">{t("fields.address")}</Label>
              <Textarea id="store-address" rows={2} value={form.address} onChange={set("address")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="store-city">{t("business.fields.city")}</Label>
                <Input id="store-city" value={form.city} onChange={set("city")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="store-postal">{t("business.fields.postalCode")}</Label>
                <Input id="store-postal" value={form.postalCode} onChange={set("postalCode")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("business.fields.province")}</Label>
              <Combobox
                aria-label={t("business.fields.province")}
                value={form.province || null}
                onChange={(v) => setForm((f) => (f ? { ...f, province: v ?? "" } : f))}
                placeholder={t("business.choose")}
                clearLabel={t("business.none")}
                options={(country?.provinces ?? []).map((p) => ({ value: p.code, label: p.name }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="store-phone">{t("fields.phone")}</Label>
                <Input id="store-phone" value={form.phone} onChange={set("phone")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="store-tz">{t("stores.timezone")}</Label>
                <Input id="store-tz" list="timezones" value={form.timezone} onChange={set("timezone")} />
                <datalist id="timezones">
                  {Intl.supportedValuesOf("timeZone").map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
              </div>
            </div>
            {country && (
              <div className="space-y-2 rounded-md border p-3">
                <Label>{t("stores.ivaRegime")}</Label>
                <Combobox
                  aria-label={t("stores.ivaRegime")}
                  value={form.ivaRegime}
                  onChange={(v) => v && setForm((f) => (f ? { ...f, ivaRegime: v as IvaRegime } : f))}
                  options={country.ivaRegimes.map((r) => ({
                    value: r.code,
                    label: r.name,
                    description: r.exemptionCode ?? undefined,
                  }))}
                />
                <p className="text-xs text-muted-foreground">{t(`stores.regimeHint.${form.ivaRegime}`)}</p>
                {regimeChanged && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("stores.regimeChangeLogged")}</p>}
                <label className="flex items-start gap-2 pt-1 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={form.pricesIncludeTax}
                    onChange={(e) => setForm((f) => (f ? { ...f, pricesIncludeTax: e.target.checked } : f))}
                  />
                  <span>
                    {t("stores.pricesIncludeTax")}
                    <span className="block text-xs text-muted-foreground">{t("stores.pricesIncludeTaxHint")}</span>
                  </span>
                </label>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("stores.printedHint")}</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? t("common:actions.saving") : t("stores.save")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Uses the stores cached in the session; a store created elsewhere shows after signing in again. */
export function StoresSettings() {
  const { t } = useTranslation(["settings", "common"]);
  const stores = useAuthStore((s) => s.stores);
  const [editing, setEditing] = React.useState<StoreDto | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("stores.store")}</TableHead>
              <TableHead>{t("fields.address")}</TableHead>
              <TableHead>{t("stores.ivaRegime")}</TableHead>
              <TableHead>{t("stores.timezone")}</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.map((store) => {
              const regime = countryConfig(store.country ?? "AO")?.ivaRegimes.find((r) => r.code === (store.ivaRegime ?? "GERAL"));
              return (
                <TableRow key={store.id}>
                  <TableCell className="font-medium">{store.name}</TableCell>
                  <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                    {[store.address, store.city].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{regime?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{store.timezone}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setEditing(store)}>
                      {t("common:actions.edit")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <EditStoreDialog store={editing} onClose={() => setEditing(null)} />
    </>
  );
}
