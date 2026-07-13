import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/features/auth/store";
import type { BusinessDto } from "@pos/shared";
import { formatCurrency } from "@/lib/format";
import { KpiCard } from "@/features/reports/components/KpiCard";
import { RevenueTrendChart } from "@/features/reports/components/RevenueTrendChart";
import { TopProductsChart } from "@/features/reports/components/TopProductsChart";
import { LowStockPanel } from "@/features/reports/components/LowStockPanel";
import { StoreComparisonChart } from "@/features/reports/components/StoreComparisonChart";
import { DateRangeSelect } from "@/features/reports/components/DateRangeSelect";
import {
  fetchLowStock,
  fetchSalesTrend,
  fetchStoreComparison,
  fetchSummary,
  fetchTopProducts,
} from "@/features/reports/api";

export function DashboardPage() {
  const stores = useAuthStore((s) => s.stores);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const role = useAuthStore((s) => s.user?.role);
  const [days, setDays] = React.useState(30);

  const businessQuery = useQuery({
    queryKey: ["business", "me"],
    queryFn: () => apiClient.get<BusinessDto>("/businesses/me"),
  });

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
    return <p className="p-6 text-muted-foreground">No store selected.</p>;
  }

  const summary = summaryQuery.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {businessQuery.data?.name ?? "Loading..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {businessQuery.data && (
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
              {businessQuery.data.plan} plan
            </span>
          )}
          <DateRangeSelect days={days} onChange={setDays} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Revenue"
          value={summary ? formatCurrency(summary.revenue) : "—"}
          deltaPct={summary?.revenueDeltaPct ?? null}
        />
        <KpiCard
          label="Profit"
          value={summary ? formatCurrency(summary.profit) : "—"}
          deltaPct={summary?.profitDeltaPct ?? null}
        />
        <KpiCard
          label="Orders"
          value={summary ? summary.orderCount.toLocaleString() : "—"}
          deltaPct={summary?.orderCountDeltaPct ?? null}
        />
        <KpiCard
          label="Avg. order value"
          value={summary ? formatCurrency(summary.avgOrderValue) : "—"}
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

      {role === "OWNER" && stores.length > 1 && comparisonQuery.data && (
        <StoreComparisonChart data={comparisonQuery.data} />
      )}
    </div>
  );
}
