import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { ACCOUNTING_KEY, updateAccountingSettings, type AccountingStatusDto, type Grouping, type PurchasesFileRule } from "../api";

/** Accounting on/off and how the POS documents are posted. */
export function AccountingSetup({ status, canWrite }: { status: AccountingStatusDto; canWrite: boolean }) {
  const { t } = useTranslation("accounting");
  const queryClient = useQueryClient();
  const s = status.settings;
  const [startDate, setStartDate] = React.useState(s?.startDate ?? `${status.today.slice(0, 4)}-01-01`);
  const [cashPerTill, setCashPerTill] = React.useState(s?.cashPerTill ?? true);
  const [grouping, setGrouping] = React.useState<Grouping>(s?.grouping ?? "PER_DOCUMENT");
  const [autoPost, setAutoPost] = React.useState(s?.autoPost ?? true);
  const [purchasesFile, setPurchasesFile] = React.useState<PurchasesFileRule>(s?.purchasesFile ?? "AUTO");

  const save = useMutation({
    mutationFn: (enabled?: boolean) => updateAccountingSettings({ enabled, startDate, cashPerTill, grouping, autoPost, purchasesFile }),
    onSuccess: (next) => {
      queryClient.setQueryData([...ACCOUNTING_KEY, "status"], next);
      void queryClient.invalidateQueries({ queryKey: ACCOUNTING_KEY });
      toast.success(t("saved"));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("failed")),
  });

  const fields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="acc-start">{t("setup.startDate")}</Label>
        <DateInput id="acc-start" value={startDate} onChange={setStartDate} disabled={!canWrite} />
        <p className="text-xs text-muted-foreground">{t("setup.startDateHint")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="acc-grouping">{t("setup.grouping")}</Label>
        <Combobox
          id="acc-grouping"
          value={grouping}
          disabled={!canWrite}
          onChange={(v) => v && setGrouping(v as Grouping)}
          options={(["PER_DOCUMENT", "DAILY_SUMMARY"] as const).map((g) => ({ value: g, label: t(`setup.groupings.${g}`) }))}
        />
        <p className="text-xs text-muted-foreground">{t("setup.groupingHint")}</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={cashPerTill} disabled={!canWrite} onChange={(e) => setCashPerTill(e.target.checked)} />
        <span>
          {t("setup.cashPerTill")}
          <span className="block text-xs text-muted-foreground">{t("setup.cashPerTillHint")}</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={autoPost} disabled={!canWrite} onChange={(e) => setAutoPost(e.target.checked)} />
        <span>{t("setup.autoPost")}</span>
      </label>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="acc-purchases-file">{t("setup.purchasesFile")}</Label>
        <Combobox
          id="acc-purchases-file"
          value={purchasesFile}
          disabled={!canWrite}
          onChange={(v) => v && setPurchasesFile(v as PurchasesFileRule)}
          options={(["AUTO", "ALWAYS", "NEVER"] as const).map((r) => ({ value: r, label: t(`setup.purchasesFiles.${r}`) }))}
        />
      </div>
    </div>
  );

  if (!status.enabled && !s) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("setup.offTitle")}</CardTitle>
          <CardDescription>{t("setup.offDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields}
          {canWrite && (
            <Button onClick={() => save.mutate(true)} disabled={save.isPending}>
              {t("setup.enable")}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{status.enabled ? t("setup.enabled") : t("setup.offTitle")}</CardTitle>
        {!status.enabled && <CardDescription>{t("setup.disabledNote")}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {fields}
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>
              {t("setup.save")}
            </Button>
            <Button variant="outline" onClick={() => save.mutate(!status.enabled)} disabled={save.isPending}>
              {status.enabled ? t("setup.disable") : t("setup.enable")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
