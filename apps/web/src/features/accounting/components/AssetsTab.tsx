import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/features/business/use-money";
import { ApiError } from "@/lib/api-client";
import { formatCalendarDate } from "@/lib/format";
import { ACCOUNTS_KEY, createAsset, depreciateAssets, disposeAsset, fetchAccounts, fetchAssetCategories, fetchAssets, type FixedAssetDto } from "../api";
import { centsToNumber, parseCents } from "../amounts";
import { usePeriodName } from "../use-period-name";

/**
 * Fixed assets: the register, each month's depreciation (one entry for all
 * assets, never twice), and disposals with their gain or loss.
 */
export function AssetsTab({ canWrite, today }: { canWrite: boolean; today: string }) {
  const { t } = useTranslation("accounting");
  const money = useMoney();
  const periodName = usePeriodName();
  const queryClient = useQueryClient();
  const assets = useQuery({ queryKey: ["accounting", "assets"], queryFn: fetchAssets });
  const categories = useQuery({ queryKey: ["accounting", "asset-categories"], queryFn: fetchAssetCategories });
  const accounts = useQuery({ queryKey: ACCOUNTS_KEY, queryFn: fetchAccounts });
  const [year, setYear] = React.useState(Number(today.slice(0, 4)));
  const [month, setMonth] = React.useState(Number(today.slice(5, 7)));
  const [adding, setAdding] = React.useState(false);
  const [disposing, setDisposing] = React.useState<FixedAssetDto | null>(null);
  const [form, setForm] = React.useState({ name: "", category: null as string | null, date: today, value: "", residual: "", rate: "", counter: null as string | null });
  const [sale, setSale] = React.useState({ date: today, value: "", counter: null as string | null });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["accounting"] });
  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("failed"));
  const accountOptions = (accounts.data ?? []).filter((a) => a.category === "GM" && a.isActive).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
  const category = categories.data?.find((c) => c.key === form.category);

  const depreciate = useMutation({
    mutationFn: () => depreciateAssets(year, month),
    onSuccess: (r) => (refresh(), toast.success(r.assets ? t("assets.depreciated", { count: r.assets, total: money(r.total) }) : t("assets.nothingToDepreciate"))),
    onError: fail,
  });
  const create = useMutation({
    mutationFn: () =>
      createAsset({
        name: form.name.trim(),
        category: form.category!,
        acquisitionDate: form.date,
        acquisitionValue: centsToNumber(parseCents(form.value) ?? 0),
        residualValue: form.residual ? centsToNumber(parseCents(form.residual) ?? 0) : undefined,
        annualRate: form.rate ? Number(form.rate.replace(",", ".")) : undefined,
        counterAccountId: form.counter ?? undefined,
      }),
    onSuccess: () => {
      refresh();
      setAdding(false);
      setForm({ name: "", category: null, date: today, value: "", residual: "", rate: "", counter: null });
      toast.success(t("saved"));
    },
    onError: fail,
  });
  const dispose = useMutation({
    mutationFn: () => disposeAsset(disposing!.id, { date: sale.date, saleValue: sale.value ? centsToNumber(parseCents(sale.value) ?? 0) : 0, counterAccountId: sale.counter ?? undefined }),
    onSuccess: (r) => {
      refresh();
      setDisposing(null);
      toast.success(t("assets.disposed", { result: money(r.result) }));
    },
    onError: fail,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("assets.description")}</p>
      {canWrite && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="w-28 space-y-1">
              <Label htmlFor="dep-year">{t("entries.year")}</Label>
              <Input id="dep-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
            </div>
            <div className="w-56 space-y-1">
              <Label htmlFor="dep-month">{t("assets.month")}</Label>
              <Combobox id="dep-month" value={String(month)} onChange={(v) => v && setMonth(Number(v))} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: periodName(year, i + 1) }))} />
            </div>
            <Button variant="outline" onClick={() => depreciate.mutate()} disabled={depreciate.isPending}>
              {t("assets.depreciate")}
            </Button>
            <Button className="ml-auto" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              {t("assets.add")}
            </Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("assets.code")}</TableHead>
                <TableHead>{t("assets.name")}</TableHead>
                <TableHead>{t("assets.acquired")}</TableHead>
                <TableHead className="text-right">{t("assets.value")}</TableHead>
                <TableHead className="text-right">{t("assets.rate")}</TableHead>
                <TableHead className="text-right">{t("assets.depreciatedSoFar")}</TableHead>
                <TableHead className="text-right">{t("assets.bookValue")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.data?.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.code}</TableCell>
                  <TableCell>
                    {a.name}
                    <span className="block text-xs text-muted-foreground">{categories.data?.find((c) => c.key === a.category)?.name}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatCalendarDate(a.acquisitionDate)}</TableCell>
                  <TableCell className="text-right">{money(a.acquisitionValue)}</TableCell>
                  <TableCell className="text-right">{a.annualRate}%</TableCell>
                  <TableCell className="text-right">{money(a.depreciated)}</TableCell>
                  <TableCell className="text-right">{money(a.netBookValue)}</TableCell>
                  <TableCell className="text-right">
                    {a.status === "DISPOSED" ? (
                      <Badge variant="outline">{t("assets.disposedOn", { date: a.disposalDate ? formatCalendarDate(a.disposalDate) : "" })}</Badge>
                    ) : (
                      canWrite && (
                        <Button size="sm" variant="ghost" onClick={() => setDisposing(a)}>
                          {t("assets.dispose")}
                        </Button>
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {assets.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-6 text-center text-muted-foreground">
                    {t("assets.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("assets.add")}</DialogTitle>
            <DialogDescription>{t("assets.rateNote")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="asset-name">{t("assets.name")}</Label>
              <Input id="asset-name" value={form.name} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="asset-category">{t("assets.category")}</Label>
              <Combobox
                id="asset-category"
                value={form.category}
                onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                options={(categories.data ?? []).map((c) => ({ value: c.key, label: c.name, description: t("assets.categoryHint", { rate: c.maxRate, account: c.asset }) }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="asset-date">{t("assets.acquired")}</Label>
              <DateInput id="asset-date" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="asset-value">{t("assets.value")}</Label>
              <Input id="asset-value" inputMode="decimal" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="asset-rate">{t("assets.rate")}</Label>
              <Input id="asset-rate" inputMode="decimal" placeholder={category ? String(category.maxRate) : ""} value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="asset-residual">{t("assets.residual")}</Label>
              <Input id="asset-residual" inputMode="decimal" value={form.residual} onChange={(e) => setForm((f) => ({ ...f, residual: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="asset-counter">{t("assets.paidFrom")}</Label>
              <Combobox id="asset-counter" value={form.counter} onChange={(v) => setForm((f) => ({ ...f, counter: v }))} options={accountOptions} clearLabel={t("assets.noPosting")} placeholder={t("assets.noPosting")} />
            </div>
          </div>
          <Button disabled={!form.name.trim() || !form.category || !parseCents(form.value) || create.isPending} onClick={() => create.mutate()}>
            {t("save")}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!disposing} onOpenChange={(o) => !o && setDisposing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("assets.disposeTitle", { name: disposing?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("assets.disposeHint", { value: money(disposing?.netBookValue ?? 0) })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="dispose-date">{t("entries.date")}</Label>
              <DateInput id="dispose-date" value={sale.date} onChange={(v) => setSale((s) => ({ ...s, date: v }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dispose-value">{t("assets.saleValue")}</Label>
              <Input id="dispose-value" inputMode="decimal" value={sale.value} onChange={(e) => setSale((s) => ({ ...s, value: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dispose-counter">{t("assets.receivedIn")}</Label>
              <Combobox id="dispose-counter" value={sale.counter} onChange={(v) => setSale((s) => ({ ...s, counter: v }))} options={accountOptions} placeholder={t("entries.chooseAccount")} />
            </div>
          </div>
          <Button disabled={dispose.isPending || (!!parseCents(sale.value) && !sale.counter)} onClick={() => dispose.mutate()}>
            {t("assets.dispose")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
