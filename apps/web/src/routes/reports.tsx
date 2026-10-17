import * as React from "react";
import { countryConfig } from "@pos/shared";
import { Download, FileCode2, FileSpreadsheet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/features/auth/store";
import { lastYearEnd, periodDates, previousMonth, todayIn, type PeriodValue } from "@/features/reports/export-periods";
import { PeriodFields } from "@/features/reports/components/PeriodFields";
import { ReportViewer } from "@/features/reports/components/ReportViewer";
import { SaftDeadlines } from "@/features/reports/components/SaftDeadlines";
import { ApiError, apiClient, saveFile } from "@/lib/api-client";

type SaftType = "FACTURACAO" | "INVENTARIO";

/**
 * Reports: the business's figures (phase 10, ReportViewer) and the files
 * for AGT and the accountant (docs/plans/ANGOLA.md, phase
 * 8b): the SAF-T (AO) invoicing file for a month (or any period), the
 * year-end inventory file, and the accountant's Excel workbook. Dates are
 * calendar dates in the shop's time zone, sent as typed.
 */
export function ReportsPage() {
  const { t } = useTranslation(["reports", "common"]);
  const business = useAuthStore((s) => s.business);
  const stores = useAuthStore((s) => s.stores);
  const today = todayIn(countryConfig(business?.country ?? null)?.timeZone ?? "UTC");

  const initialPeriod = (): PeriodValue => {
    const month = previousMonth(today);
    return { mode: "month", month, startDate: `${month}-01`, endDate: today };
  };
  const [saftType, setSaftType] = React.useState<SaftType>("FACTURACAO");
  const [saftPeriod, setSaftPeriod] = React.useState<PeriodValue>(initialPeriod);
  const [inventoryDate, setInventoryDate] = React.useState(() => lastYearEnd(today));
  const [saftStore, setSaftStore] = React.useState<string | null>(null);
  const [accountantPeriod, setAccountantPeriod] = React.useState<PeriodValue>(initialPeriod);
  const [accountantStore, setAccountantStore] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"saft" | "accountant" | null>(null);

  const storeOptions = stores.map((s) => ({ value: s.id, label: s.name }));

  async function download(kind: "saft" | "accountant", path: string, params: Record<string, string | null>) {
    const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
    setBusy(kind);
    try {
      const file = await apiClient.download(`${path}?${query}`);
      saveFile(file);
      toast.success(t("exports.done", { file: file.fileName }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("exports.failed"));
    } finally {
      setBusy(null);
    }
  }

  function exportSaft() {
    if (saftType === "INVENTARIO") {
      return download("saft", "/fiscal-documents/saft/inventario", { date: inventoryDate, storeId: saftStore });
    }
    return download("saft", "/fiscal-documents/saft/facturacao", { ...periodDates(saftPeriod), storeId: saftStore });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <SaftDeadlines link={false} />

      <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") === "files" ? "files" : "figures"}>
        <TabsList>
          <TabsTrigger value="figures">{t("tables.tab")}</TabsTrigger>
          <TabsTrigger value="files">{t("exports.tab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="figures" className="mt-4">
          <ReportViewer />
        </TabsContent>
        <TabsContent value="files" className="mt-4 space-y-4">
      <p className="text-muted-foreground">{t("exports.description")}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode2 className="h-5 w-5" aria-hidden />
              {t("exports.saftTitle")}
            </CardTitle>
            <CardDescription>{t("exports.saftDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="saft-type">{t("exports.saftType")}</Label>
              <Combobox
                id="saft-type"
                value={saftType}
                onChange={(v) => v && setSaftType(v as SaftType)}
                options={[
                  { value: "FACTURACAO", label: t("exports.facturacao"), description: t("exports.facturacaoHint") },
                  { value: "INVENTARIO", label: t("exports.inventario"), description: t("exports.inventarioHint") },
                ]}
              />
            </div>
            {saftType === "FACTURACAO" ? (
              <PeriodFields id="saft" value={saftPeriod} onChange={setSaftPeriod} />
            ) : (
              <div className="space-y-2">
                <Label htmlFor="inventory-date">{t("exports.stockDate")}</Label>
                <DateInput id="inventory-date" value={inventoryDate} onChange={setInventoryDate} />
                <p className="text-xs text-muted-foreground">{t("exports.inventarioDraft")}</p>
              </div>
            )}
            <StoreField id="saft-store" value={saftStore} onChange={setSaftStore} options={storeOptions} />
            <Button onClick={exportSaft} disabled={busy !== null}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              {busy === "saft" ? t("exports.generating") : t("exports.generate")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" aria-hidden />
              {t("exports.accountantTitle")}
            </CardTitle>
            <CardDescription>{t("exports.accountantDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PeriodFields id="accountant" value={accountantPeriod} onChange={setAccountantPeriod} />
            <StoreField id="accountant-store" value={accountantStore} onChange={setAccountantStore} options={storeOptions} />
            <Button
              onClick={() => download("accountant", "/fiscal-documents/accountant-export", { ...periodDates(accountantPeriod), storeId: accountantStore })}
              disabled={busy !== null}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden />
              {busy === "accountant" ? t("exports.generating") : t("exports.generateExcel")}
            </Button>
          </CardContent>
        </Card>
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StoreField({ id, value, onChange, options }: { id: string; value: string | null; onChange: (v: string | null) => void; options: { value: string; label: string }[] }) {
  const { t } = useTranslation("reports");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("exports.store")}</Label>
      <Combobox id={id} value={value} onChange={onChange} options={options} placeholder={t("exports.allStores")} clearLabel={t("exports.allStores")} />
    </div>
  );
}
