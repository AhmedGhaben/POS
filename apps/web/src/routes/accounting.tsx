import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/features/auth/store";
import { fetchAccountingStatus, STATUS_KEY } from "@/features/accounting/api";
import { AccountingSetup } from "@/features/accounting/components/AccountingSetup";
import { ChartOfAccounts } from "@/features/accounting/components/ChartOfAccounts";
import { FiscalYears } from "@/features/accounting/components/FiscalYears";
import { EntriesTab } from "@/features/accounting/components/EntriesTab";
import { IntegrationTab } from "@/features/accounting/components/IntegrationTab";
import { AccountingReports } from "@/features/accounting/components/AccountingReports";
import { SaftTab } from "@/features/accounting/components/SaftTab";
import { AccountantClients } from "@/features/accounting/components/AccountantClients";
import { AccountantsSettings } from "@/features/accounting/components/AccountantsSettings";

const TABS = ["entries", "reports", "saft", "integration", "chart", "periods", "setup"] as const;
type Tab = (typeof TABS)[number];

/**
 * Contabilidade (docs/ACCOUNTING-DECISIONS.md): the books kept from the
 * POS. Owners change them; managers read. Until it's switched on, only the
 * settings show.
 */
export function AccountingPage() {
  const { t } = useTranslation(["accounting", "common"]);
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === "OWNER" || role === "ACCOUNTANT";
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: fetchAccountingStatus });
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : "entries";

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        {!canWrite && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
      </div>
      {role === "ACCOUNTANT" && <AccountantClients />}
      {!status.data ? (
        <p className="text-muted-foreground">{t("common:actions.loading")}</p>
      ) : !status.data.enabled && !status.data.settings ? (
        <AccountingSetup status={status.data} canWrite={canWrite} />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <TabsList className="flex-wrap">
            {TABS.map((k) => (
              <TabsTrigger key={k} value={k}>
                {t(`tabs.${k}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="entries" className="mt-4">
            <EntriesTab canWrite={canWrite} today={status.data.today} />
          </TabsContent>
          <TabsContent value="reports" className="mt-4">
            <AccountingReports today={status.data.today} />
          </TabsContent>
          <TabsContent value="saft" className="mt-4">
            <SaftTab today={status.data.today} canWrite={canWrite} />
          </TabsContent>
          <TabsContent value="integration" className="mt-4">
            <IntegrationTab canWrite={canWrite} />
          </TabsContent>
          <TabsContent value="chart" className="mt-4">
            <ChartOfAccounts canWrite={canWrite} />
          </TabsContent>
          <TabsContent value="periods" className="mt-4">
            <FiscalYears canWrite={canWrite} today={status.data.today} />
          </TabsContent>
          <TabsContent value="setup" className="mt-4">
            <div className="space-y-4">
              <AccountingSetup status={status.data} canWrite={canWrite} />
              {role === "OWNER" && <AccountantsSettings />}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
