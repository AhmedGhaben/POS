import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/features/auth/store";
import type { BusinessDto } from "@pos/shared";

/**
 * Placeholder shell — real charts (sales trends, top sellers, low-stock
 * alerts, store comparisons) land in Phase 3. This confirms the plan-tiering
 * pattern end-to-end (Business.plan is visible here) without building
 * analytics yet.
 */
export function DashboardPage() {
  const stores = useAuthStore((s) => s.stores);
  const businessQuery = useQuery({
    queryKey: ["business", "me"],
    queryFn: () => apiClient.get<BusinessDto>("/businesses/me"),
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {businessQuery.data?.name ?? "Loading..."}
          </p>
        </div>
        {businessQuery.data && (
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
            {businessQuery.data.plan} plan
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stores</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{stores.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today's sales</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-muted-foreground">—</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Low stock items</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-muted-foreground">—</CardContent>
        </Card>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Real-time analytics, profit tracking, and store comparisons arrive in Phase 3.
      </p>
    </div>
  );
}
