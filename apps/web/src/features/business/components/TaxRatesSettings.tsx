import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { countryConfig, type TaxRateDto } from "@pos/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthStore } from "@/features/auth/store";
import { createTaxRate, fetchTaxRates, TAX_RATES_QUERY_KEY, updateTaxRate } from "../api";

const TAX_CODES = ["NOR", "RED", "INT", "OUT"] as const;

interface RateForm {
  name: string;
  percentage: string;
  taxCode: string;
  region: string;
  note: string;
}

/**
 * The IVA rates products can use: the country's defaults to start with
 * (14% geral, 5% reduzida, 7% intermédia, 1% Cabinda in Angola), which the
 * owner can change, retire or add to. Which rate a product uses is chosen
 * on the product (phase 6).
 */
export function TaxRatesSettings() {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const country = countryConfig(useAuthStore((s) => s.business?.country) ?? "AO");
  const rates = useQuery({ queryKey: TAX_RATES_QUERY_KEY, queryFn: fetchTaxRates });
  const [editing, setEditing] = React.useState<TaxRateDto | "new" | null>(null);
  const [form, setForm] = React.useState<RateForm>({ name: "", percentage: "", taxCode: "NOR", region: "AO", note: "" });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!editing) return;
    setError(null);
    setForm(
      editing === "new"
        ? { name: "", percentage: "", taxCode: "RED", region: country?.code ?? "AO", note: "" }
        : { name: editing.name, percentage: String(Number(editing.percentage)), taxCode: editing.taxCode, region: editing.region, note: editing.note ?? "" },
    );
  }, [editing, country?.code]);

  const refresh = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: TAX_RATES_QUERY_KEY });
    toast.success(message);
  };
  const percentage = Number(form.percentage.replace(",", "."));
  const valid = form.name.trim() !== "" && form.percentage.trim() !== "" && Number.isFinite(percentage) && percentage >= 0 && percentage <= 100;

  const save = useMutation({
    mutationFn: () =>
      editing && editing !== "new"
        ? updateTaxRate(editing.id, { name: form.name, percentage, note: form.note })
        : createTaxRate({ name: form.name, taxCode: form.taxCode, percentage, region: form.region, note: form.note || undefined }),
    onSuccess: () => {
      refresh(t("rates.saved"));
      setEditing(null);
    },
    onError: (err) => setError((err as Error).message),
  });
  const quick = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Parameters<typeof updateTaxRate>[1] }) => updateTaxRate(id, dto),
    onSuccess: () => refresh(t("rates.saved")),
    onError: (err) => toast.error((err as Error).message),
  });

  const regionName = (region: string) =>
    region === country?.specialRegion?.region ? country.provinces.find((p) => p.code === country.specialRegion!.province)?.name ?? region : country?.name ?? region;
  const regions = country ? [country.code, ...(country.specialRegion ? [country.specialRegion.region] : [])] : ["AO"];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("rates.name")}</TableHead>
              <TableHead className="text-right">{t("rates.rate")}</TableHead>
              <TableHead>{t("rates.code")}</TableHead>
              <TableHead>{t("rates.region")}</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.data?.map((r) => (
              <TableRow key={r.id} className={r.active ? undefined : "text-muted-foreground"}>
                <TableCell>
                  <span className="font-medium">{r.name}</span>
                  {r.isDefault && (
                    <Badge variant="secondary" className="ml-2">
                      {t("rates.default")}
                    </Badge>
                  )}
                  {!r.active && (
                    <Badge variant="outline" className="ml-2">
                      {t("rates.off")}
                    </Badge>
                  )}
                  {r.verifyValidity && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400" title={r.note ?? undefined}>
                      <AlertTriangle className="h-3 w-3" /> {t("rates.verify")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">{Number(r.percentage)}%</TableCell>
                <TableCell>{r.taxCode}</TableCell>
                <TableCell>{regionName(r.region)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                      {t("common:actions.edit")}
                    </Button>
                    {!r.isDefault && r.active && (
                      <Button variant="ghost" size="sm" onClick={() => quick.mutate({ id: r.id, dto: { isDefault: true } })}>
                        {t("rates.makeDefault")}
                      </Button>
                    )}
                    {!r.isDefault && (
                      <Button variant="ghost" size="sm" onClick={() => quick.mutate({ id: r.id, dto: { active: !r.active } })}>
                        {r.active ? t("rates.turnOff") : t("rates.turnOn")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" onClick={() => setEditing("new")}>
        {t("rates.add")}
      </Button>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("rates.add") : t("rates.edit")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="rate-name">{t("rates.name")}</Label>
              <Input id="rate-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate-percentage">{t("rates.rate")} (%)</Label>
              <Input id="rate-percentage" inputMode="decimal" value={form.percentage} onChange={(e) => setForm((f) => ({ ...f, percentage: e.target.value }))} />
            </div>
            {editing === "new" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("rates.code")}</Label>
                  <Combobox
                    aria-label={t("rates.code")}
                    value={form.taxCode}
                    onChange={(v) => v && setForm((f) => ({ ...f, taxCode: v }))}
                    options={TAX_CODES.map((c) => ({ value: c, label: t(`rates.codes.${c}`), description: c }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("rates.region")}</Label>
                  <Combobox
                    aria-label={t("rates.region")}
                    value={form.region}
                    onChange={(v) => v && setForm((f) => ({ ...f, region: v }))}
                    options={regions.map((r) => ({ value: r, label: regionName(r), description: r }))}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="rate-note">{t("rates.note")}</Label>
              <Input id="rate-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!valid || save.isPending}>
              {save.isPending ? t("common:actions.saving") : t("common:actions.save")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
