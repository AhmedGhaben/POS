import { AlertTriangle, OctagonAlert } from "lucide-react";
import type { LowStockReportItemDto } from "@pos/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
      <CardContent className="overflow-x-auto p-0">
        {items.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            All products are above their reorder level.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Reorder level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.product.name}</TableCell>
                  <TableCell>
                    <StockBadge quantity={item.quantity} />
                  </TableCell>
                  <TableCell className="text-right font-medium">{item.quantity}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{item.reorderLevel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
