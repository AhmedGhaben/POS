import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  deltaPct: number | null;
  /** Whether an increase is the desired direction (true for revenue/profit; false for e.g. costs). */
  upIsGood?: boolean;
}

/** Stat tile: label + value + signed delta vs the prior period of equal length. */
export function KpiCard({ label, value, deltaPct, upIsGood = true }: KpiCardProps) {
  const isUp = deltaPct !== null && deltaPct > 0;
  const isDown = deltaPct !== null && deltaPct < 0;
  const isGoodDirection = (isUp && upIsGood) || (isDown && !upIsGood);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
        {deltaPct !== null ? (
          <div
            className={cn(
              "mt-1 flex items-center gap-1 text-sm",
              isGoodDirection ? "text-[color:var(--chart-delta-good)]" : "text-[color:var(--chart-delta-bad)]",
              deltaPct === 0 && "text-muted-foreground",
            )}
          >
            {isUp && <ArrowUp className="h-3.5 w-3.5" />}
            {isDown && <ArrowDown className="h-3.5 w-3.5" />}
            <span>
              {deltaPct === 0 ? "No change" : `${Math.abs(deltaPct).toFixed(1)}%`} vs prior period
            </span>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">New this period</p>
        )}
      </CardContent>
    </Card>
  );
}
