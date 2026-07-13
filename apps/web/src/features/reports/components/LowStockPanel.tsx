import { AlertTriangle, OctagonAlert } from "lucide-react";
import type { LowStockReportItemDto } from "@pos/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LowStockPanelProps {
  items: LowStockReportItemDto[];
}

/** Status conveyed via icon + label together — never color alone. */
function StockBadge({ quantity }: { quantity: number }) {
  const isOut = quantity === 0;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: isOut ? "var(--chart-critical)" : "var(--chart-warning)" }}
    >
      {isOut ? <OctagonAlert className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {isOut ? "Out of stock" : "Low stock"}
    </span>
  );
}

export function LowStockPanel({ items }: LowStockPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Low stock</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            All products are above their reorder level.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-right">Quantity</th>
                <th className="p-3 font-medium text-right">Reorder level</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="p-3">{item.product.name}</td>
                  <td className="p-3">
                    <StockBadge quantity={item.quantity} />
                  </td>
                  <td className="p-3 text-right font-medium">{item.quantity}</td>
                  <td className="p-3 text-right text-muted-foreground">{item.reorderLevel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
