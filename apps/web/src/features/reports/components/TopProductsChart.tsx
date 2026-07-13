import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TopProductReportDto } from "@pos/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

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
        {formatCurrency(item.revenue)} · {item.quantitySold} sold
      </p>
    </div>
  );
}

/** Magnitude comparison across a handful of named items — sequential blue, one measure. */
export function TopProductsChart({ data }: TopProductsChartProps) {
  const hasData = data.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top products</CardTitle>
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
                  formatter={(v: unknown) => formatCurrency(Number(v))}
                  fill="var(--chart-ink-secondary)"
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No sales in this period yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
