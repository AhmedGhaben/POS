import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StoreComparisonDto } from "@pos/shared";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { currentCurrency, useCompactMoney } from "@/features/business/use-money";

interface StoreComparisonChartProps {
  data: StoreComparisonDto[];
}

function StoreComparisonTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const store = payload[0].payload as StoreComparisonDto;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{store.storeName}</p>
      <p className="text-muted-foreground">
        {i18n.t("reports:charts.revenueProfit", {
          revenue: formatCurrency(store.revenue, currentCurrency()),
          profit: formatCurrency(store.profit, currentCurrency()),
        })}
      </p>
      <p className="text-muted-foreground">{i18n.t("reports:charts.orders", { count: store.orderCount })}</p>
    </div>
  );
}

/** Owner-only, multi-store businesses only — magnitude comparison, sequential blue. */
export function StoreComparisonChart({ data }: StoreComparisonChartProps) {
  const { t } = useTranslation("reports");
  const compact = useCompactMoney();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("charts.storePerformance")}</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="storeName"
              tick={{ fill: "var(--chart-ink-secondary)", fontSize: 12 }}
              axisLine={{ stroke: "var(--chart-axis)" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => compact(v)}
              tick={{ fill: "var(--chart-ink-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip content={<StoreComparisonTooltip />} cursor={{ fill: "var(--chart-grid)" }} />
            <Bar dataKey="revenue" fill="var(--chart-series-1)" radius={[4, 4, 0, 0]} maxBarSize={64}>
              <LabelList
                dataKey="revenue"
                position="top"
                formatter={(v: unknown) => compact(Number(v))}
                fill="var(--chart-ink-secondary)"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
