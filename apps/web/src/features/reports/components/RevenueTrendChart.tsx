import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SalesTrendPointDto } from "@pos/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatShortDate } from "@/lib/format";

interface RevenueTrendChartProps {
  data: SalesTrendPointDto[];
}

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as SalesTrendPointDto;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{formatShortDate(label)}</p>
      <p className="text-muted-foreground">
        {formatCurrency(point.revenue)} · {point.orderCount} order{point.orderCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Single-series trend — sequential blue, per the "trend over time" form. No legend needed for one series. */
export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue trend</CardTitle>
      </CardHeader>
      <CardContent className="h-72 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fill: "var(--chart-ink-muted)", fontSize: 12 }}
              axisLine={{ stroke: "var(--chart-axis)" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v: number) => formatCurrency(v)}
              tick={{ fill: "var(--chart-ink-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--chart-axis)" }} />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="var(--chart-series-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
