import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { countryConfig, documentLanguageFor, type IvaRegime, type SaleDocumentFormat, type StoreDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuthStore } from "@/features/auth/store";
import { createStore, updateStore } from "@/features/business/api";
import { LANGUAGES } from "@/i18n";

/** The "from the country" choice of the document language. */
const AUTO = "auto";

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
  saleDocumentFormat: SaleDocumentFormat;
  documentCopies: number;
  /** "" = the country's. */
  documentLanguage: string;
}

function EditStoreDialog({ store, onClose }: { store: StoreDto | null; onClose: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const updateCached = useAuthStore((s) => s.updateStore);
  const business = useAuthStore((s) => s.business);
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
      saleDocumentFormat: store.saleDocumentFormat ?? "RECEIPT",
      documentCopies: store.documentCopies ?? 1,
      documentLanguage: store.documentLanguage ?? "",
    });
    setError(null);
  }, [store]);

  const mutation = useMutation({
    mutationFn: () => updateStore(store!.id, { ...form!, province: form!.province || null, documentLanguage: form!.documentLanguage || null }),
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
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">{t("stores.printing")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="store-sale-format">{t("stores.saleDocumentFormat")}</Label>
                  <Combobox
                    id="store-sale-format"
                    value={form.saleDocumentFormat}
                    onChange={(v) => v && setForm((f) => (f ? { ...f, saleDocumentFormat: v as SaleDocumentFormat } : f))}
                    options={[
                      { value: "RECEIPT", label: t("stores.formats.RECEIPT") },
                      { value: "A4", label: t("stores.formats.A4") },
                    ]}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="store-copies">{t("stores.documentCopies")}</Label>
                  <Combobox
                    id="store-copies"
                    value={String(form.documentCopies)}
                    onChange={(v) => v && setForm((f) => (f ? { ...f, documentCopies: Number(v) } : f))}
                    options={[1, 2, 3].map((n) => ({ value: String(n), label: t(n === 1 ? "stores.copies.1" : n === 2 ? "stores.copies.2" : "stores.copies.3") }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-document-language">{t("stores.documentLanguage")}</Label>
                <Combobox
                  id="store-document-language"
                  value={form.documentLanguage || AUTO}
                  onChange={(v) => setForm((f) => (f ? { ...f, documentLanguage: !v || v === AUTO ? "" : v } : f))}
                  options={[
                    {
                      value: AUTO,
                      label: t("stores.documentLanguageAuto", {
                        language: LANGUAGES.find((l) => l.code === documentLanguageFor({ country: store?.country }, business?.language))?.label ?? "",
                      }),
                    },
                    ...LANGUAGES.map((l) => ({ value: l.code, label: l.label })),
                  ]}
                />
                <p className="text-xs text-muted-foreground">{t("stores.documentLanguageHint")}</p>
              </div>
              <p className="text-xs text-muted-foreground">{t("stores.printingHint")}</p>
            </div>
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

interface NewStoreForm {
  name: string;
  address: string;
  city: string;
  province: string;
  ivaRegime: IvaRegime;
  /** "" = the country's. */
  documentLanguage: string;
  timezone: string;
}

/**
 * Adds a store (owner). The IVA regime and time zone start from the
 * country's; once it exists, staff can be given access and tills paired.
 */
function AddStoreDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const addCached = useAuthStore((s) => s.addStore);
  const business = useAuthStore((s) => s.business);
  const country = countryConfig(business?.country ?? "AO");
  const blank = React.useCallback(
    (): NewStoreForm => ({
      name: "",
      address: "",
      city: "",
      province: "",
      ivaRegime: (country?.defaultIvaRegime ?? "GERAL") as IvaRegime,
      documentLanguage: "",
      timezone: country?.timeZone ?? "Africa/Luanda",
    }),
    [country],
  );
  const [form, setForm] = React.useState<NewStoreForm>(blank);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<StoreDto | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(blank());
    setError(null);
    setCreated(null);
  }, [open, blank]);

  const mutation = useMutation({
    mutationFn: () =>
      createStore({
        name: form.name.trim(),
        address: form.address || null,
        city: form.city || null,
        province: form.province || null,
        ivaRegime: form.ivaRegime,
        documentLanguage: form.documentLanguage || null,
        timezone: form.timezone,
      }),
    onSuccess: (store) => {
      addCached(store);
      toast.success(t("stores.created"));
      setCreated(store);
    },
    onError: (err) => setError((err as Error).message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError(t("stores.nameRequired"));
    if (!isValidTimezone(form.timezone)) return setError(t("stores.badTimezone"));
    setError(null);
    mutation.mutate();
  }

  const set = (key: "name" | "address" | "city" | "timezone") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{created ? t("stores.createdTitle", { name: created.name }) : t("stores.add")}</DialogTitle>
        </DialogHeader>
        {created ? (
          <div className="space-y-3 text-sm">
            <p>{t("stores.nextSteps")}</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <Link to="/employees" className="font-medium underline underline-offset-4" onClick={onClose}>
                  {t("stores.nextStaff")}
                </Link>
              </li>
              <li>{t("stores.nextTills")}</li>
            </ul>
            <Button className="w-full" onClick={onClose}>
              {t("stores.done")}
            </Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="new-store-name">{t("stores.name")}</Label>
              <Input id="new-store-name" value={form.name} onChange={set("name")} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-store-address">{t("fields.address")}</Label>
              <Textarea id="new-store-address" rows={2} value={form.address} onChange={set("address")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-store-city">{t("business.fields.city")}</Label>
                <Input id="new-store-city" value={form.city} onChange={set("city")} />
              </div>
              <div className="space-y-2">
                <Label>{t("business.fields.province")}</Label>
                <Combobox
                  aria-label={t("business.fields.province")}
                  value={form.province || null}
                  onChange={(v) => setForm((f) => ({ ...f, province: v ?? "" }))}
                  placeholder={t("business.choose")}
                  clearLabel={t("business.none")}
                  options={(country?.provinces ?? []).map((p) => ({ value: p.code, label: p.name }))}
                />
              </div>
            </div>
            {country && (
              <div className="space-y-2">
                <Label>{t("stores.ivaRegime")}</Label>
                <Combobox
                  aria-label={t("stores.ivaRegime")}
                  value={form.ivaRegime}
                  onChange={(v) => v && setForm((f) => ({ ...f, ivaRegime: v as IvaRegime }))}
                  options={country.ivaRegimes.map((r) => ({ value: r.code, label: r.name, description: r.exemptionCode ?? undefined }))}
                />
                <p className="text-xs text-muted-foreground">{t(`stores.regimeHint.${form.ivaRegime}`)}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-store-language">{t("stores.documentLanguage")}</Label>
                <Combobox
                  id="new-store-language"
                  value={form.documentLanguage || AUTO}
                  onChange={(v) => setForm((f) => ({ ...f, documentLanguage: !v || v === AUTO ? "" : v }))}
                  options={[
                    {
                      value: AUTO,
                      label: t("stores.documentLanguageAuto", {
                        language: LANGUAGES.find((l) => l.code === documentLanguageFor({ country: business?.country }, business?.language))?.label ?? "",
                      }),
                    },
                    ...LANGUAGES.map((l) => ({ value: l.code, label: l.label })),
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-store-tz">{t("stores.timezone")}</Label>
                <Input id="new-store-tz" list="timezones" value={form.timezone} onChange={set("timezone")} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? t("common:actions.saving") : t("stores.add")}
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
  const isOwner = useAuthStore((s) => s.user?.role === "OWNER");
  const [editing, setEditing] = React.useState<StoreDto | null>(null);
  const [adding, setAdding] = React.useState(false);

  return (
    <>
      {isOwner && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" /> {t("stores.add")}
          </Button>
        </div>
      )}
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
      <AddStoreDialog open={adding} onClose={() => setAdding(false)} />
      <datalist id="timezones">
        {Intl.supportedValuesOf("timeZone").map((tz) => (
          <option key={tz} value={tz} />
        ))}
      </datalist>
    </>
  );
}
