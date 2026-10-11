import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TopProductReportDto } from "@pos/shared";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { currentCurrency, useCompactMoney } from "@/features/business/use-money";

interface TopProductsChartProps {
  data: TopProductReportDto[];
}

function TopProductsTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload as TopProductReportDto;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{item.name}</p>
      <p className="text-muted-foreground">
        {formatCurrency(item.revenue, currentCurrency())} · {i18n.t("reports:charts.sold", { count: item.quantitySold })}
      </p>
    </div>
  );
}

/** Magnitude comparison across a handful of named items — sequential blue, one measure. */
export function TopProductsChart({ data }: TopProductsChartProps) {
  const { t } = useTranslation("reports");
  const compact = useCompactMoney();
  const hasData = data.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("charts.topProducts")}</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 48, bottom: 0, left: 8 }}
              barCategoryGap="24%"
            >
              <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "var(--chart-ink-secondary)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={120}
              />
              <Tooltip content={<TopProductsTooltip />} cursor={{ fill: "var(--chart-grid)" }} />
              <Bar dataKey="revenue" fill="var(--chart-series-1)" radius={[0, 4, 4, 0]} maxBarSize={24}>
                <LabelList
                  dataKey="revenue"
                  position="right"
                  formatter={(v: unknown) => compact(Number(v))}
                  fill="var(--chart-ink-secondary)"
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("charts.noSales")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
