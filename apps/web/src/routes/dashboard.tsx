import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { Download, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/features/auth/store";
import { BUSINESS_QUERY_KEY, fetchBusiness } from "@/features/business/api";
import { useCompactMoney, useCurrency } from "@/features/business/use-money";
import { useDocumentLang } from "@/i18n/use-document-language";
import { formatCalendarDate, formatCurrency } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/features/reports/components/KpiCard";
import { RevenueTrendChart } from "@/features/reports/components/RevenueTrendChart";
import { TopProductsChart } from "@/features/reports/components/TopProductsChart";
import { LowStockPanel } from "@/features/reports/components/LowStockPanel";
import { InsightsPanel } from "@/features/reports/components/InsightsPanel";
import { StoreComparisonChart } from "@/features/reports/components/StoreComparisonChart";
import { DateRangeSelect } from "@/features/reports/components/DateRangeSelect";
import { SaftDeadlines } from "@/features/reports/components/SaftDeadlines";
import {
  fetchLowStock,
  fetchSalesTrend,
  fetchStoreComparison,
  fetchSummary,
  fetchTopProducts,
} from "@/features/reports/api";

/** jsPDF's built-in fonts have no narrow no-break space (Portuguese thousands): use the plain no-break one. */
const pdfText = (text: string) => text.replace(/\u202f/g, "\u00a0");

export function DashboardPage() {
  const { t, i18n } = useTranslation(["reports", "common"]);
  // The CSV and PDF leave the screen: the store's document language and number format.
  const docLang = useDocumentLang();
  const { t: docT } = useTranslation(["reports", "common"], { lng: docLang });
  const currency = useCurrency();
  const docCompact = (value: number) => pdfText(formatCurrency(value, currency, docLang));
  const compact = useCompactMoney();
  const stores = useAuthStore((s) => s.stores);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const role = useAuthStore((s) => s.user?.role);
  const [days, setDays] = React.useState(30);

  const businessQuery = useQuery({ queryKey: BUSINESS_QUERY_KEY, queryFn: fetchBusiness });

  const summaryQuery = useQuery({
    queryKey: ["reports", "summary", currentStoreId, days],
    queryFn: () => fetchSummary(currentStoreId!, days),
    enabled: !!currentStoreId,
  });
  const trendQuery = useQuery({
    queryKey: ["reports", "sales-trend", currentStoreId, days],
    queryFn: () => fetchSalesTrend(currentStoreId!, days),
    enabled: !!currentStoreId,
  });
  const topProductsQuery = useQuery({
    queryKey: ["reports", "top-products", currentStoreId, days],
    queryFn: () => fetchTopProducts(currentStoreId!, days, 5),
    enabled: !!currentStoreId,
  });
  const lowStockQuery = useQuery({
    queryKey: ["reports", "low-stock", currentStoreId],
    queryFn: () => fetchLowStock(currentStoreId!),
    enabled: !!currentStoreId,
  });
  const comparisonQuery = useQuery({
    queryKey: ["reports", "store-comparison", days],
    queryFn: () => fetchStoreComparison(days),
    enabled: role === "OWNER" && stores.length > 1,
  });

  if (!currentStoreId) {
    return <p className="p-6 text-muted-foreground">{t("noStore")}</p>;
  }

  const summary = summaryQuery.data;
  const canCompareStores = role === "OWNER" && stores.length > 1;
  const storeName = stores.find((s) => s.id === currentStoreId)?.name ?? t("store");

  function exportTrendCsv() {
    downloadCsv(
      docT("export.trendFile", { store: storeName }),
      [
        { header: docT("export.date"), value: (r: { date: string }) => formatCalendarDate(r.date) },
        { header: docT("kpi.revenue"), value: (r: { revenue: number }) => r.revenue },
        { header: docT("kpi.orders"), value: (r: { orderCount: number }) => r.orderCount },
      ],
      trendQuery.data ?? [],
    );
  }

  function exportSummaryPdf() {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${businessQuery.data?.name ?? docT("export.business")} — ${storeName}`, 14, 16);
    doc.setFontSize(10);
    doc.text(docT("lastDays", { count: days }), 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [[docT("export.metric"), docT("export.value")]],
      body: [
        [docT("kpi.revenue"), summary ? docCompact(summary.revenue) : "—"],
        [docT("kpi.profit"), summary ? docCompact(summary.profit) : "—"],
        [docT("kpi.orders"), summary ? String(summary.orderCount) : "—"],
        [docT("kpi.avgOrder"), summary ? docCompact(summary.avgOrderValue) : "—"],
      ],
    });

    const afterKpiY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 28;
    autoTable(doc, {
      startY: afterKpiY + 10,
      head: [[docT("export.topProduct"), docT("export.qtySold"), docT("kpi.revenue")]],
      body: (topProductsQuery.data ?? []).map((p) => [
        p.name,
        String(p.quantitySold),
        docCompact(p.revenue),
      ]),
    });

    doc.save(docT("export.reportFile", { store: storeName }));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("common:nav.dashboard")}</h1>
          <p className="text-sm text-muted-foreground">
            {businessQuery.data?.name ?? t("common:actions.loading")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {businessQuery.data && (
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
              {t("plan", { plan: businessQuery.data.plan })}
            </span>
          )}
          <DateRangeSelect days={days} onChange={setDays} />
          <Button variant="outline" size="sm" disabled={!trendQuery.data?.length} onClick={exportTrendCsv}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" disabled={!summary} onClick={exportSummaryPdf}>
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <SaftDeadlines />

      <Tabs defaultValue="overview">
        {canCompareStores && (
          <TabsList>
            <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
            <TabsTrigger value="comparison">{t("tabs.comparison")}</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={t("kpi.revenue")}
              value={summary ? compact(summary.revenue) : "—"}
              deltaPct={summary?.revenueDeltaPct ?? null}
            />
            <KpiCard
              label={t("kpi.profit")}
              value={summary ? compact(summary.profit) : "—"}
              deltaPct={summary?.profitDeltaPct ?? null}
            />
            <KpiCard
              label={t("kpi.orders")}
              value={summary ? summary.orderCount.toLocaleString(i18n.language) : "—"}
              deltaPct={summary?.orderCountDeltaPct ?? null}
            />
            <KpiCard
              label={t("kpi.avgOrder")}
              value={summary ? compact(summary.avgOrderValue) : "—"}
              deltaPct={summary?.avgOrderValueDeltaPct ?? null}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RevenueTrendChart data={trendQuery.data ?? []} />
            </div>
            <TopProductsChart data={topProductsQuery.data ?? []} />
          </div>

          <LowStockPanel items={lowStockQuery.data ?? []} />

          <InsightsPanel storeId={currentStoreId} days={days} />
        </TabsContent>

        {canCompareStores && (
          <TabsContent value="comparison">
            {comparisonQuery.data && <StoreComparisonChart data={comparisonQuery.data} />}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
