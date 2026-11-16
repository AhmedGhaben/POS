import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SalesTrendPointDto } from "@pos/shared";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCalendarDate, formatCurrency, formatShortDate } from "@/lib/format";
import { currentCurrency, useCurrency } from "@/features/business/use-money";
import { axisAmount } from "../chart-labels";

interface RevenueTrendChartProps {
  data: SalesTrendPointDto[];
}

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as SalesTrendPointDto;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{formatCalendarDate(label)}</p>
      <p className="text-muted-foreground">
        {formatCurrency(point.revenue, currentCurrency())} · {point.orderCount} order{point.orderCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/**
 * Daily revenue as bars (brand green, one series, no legend). Bars, not a
 * smoothed line: a curve between days invents peaks and dips below zero.
 */
export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  const { t } = useTranslation("reports");
  const currency = useCurrency();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("charts.revenueTrend")}</CardTitle>
      </CardHeader>
      <CardContent className="h-72 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          {/* Top margin: the highest tick label is never clipped. */}
          <BarChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => formatShortDate(v)}
              tick={{ fill: "var(--chart-ink-muted)", fontSize: 12 }}
              axisLine={{ stroke: "var(--chart-axis)" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v: number) => axisAmount(v, currency)}
              tick={{ fill: "var(--chart-ink-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: "var(--sb-chart-track)" }} />
            <Bar dataKey="revenue" fill="var(--chart-series-1)" radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
