import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FiscalChainAlertDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

/**
 * Breaks in a hash chain that the server found when documents arrived: a
 * till's signature that doesn't match the document (edited, or signed over
 * another previous document), a missing or re-ordered number, an unknown key
 * version. Managers look into each and mark it checked.
 */
export function ChainAlerts() {
  const { t } = useTranslation("invoices");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["fiscal-documents", "alerts"],
    queryFn: () => apiClient.get<FiscalChainAlertDto[]>("/fiscal-documents/alerts"),
  });
  const resolve = useMutation({
    mutationFn: (id: string) => apiClient.post(`/fiscal-documents/alerts/${id}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fiscal-documents", "alerts"] }),
  });
  const alerts = query.data ?? [];
  if (alerts.length === 0) return null;
  return (
    <div className="mb-4 space-y-2 rounded-md border border-destructive/50 bg-destructive/5 p-3" role="alert">
      <p className="flex items-center gap-2 font-medium text-destructive">
        <ShieldAlert className="h-4 w-4" /> {t("fiscal.alertsTitle", { count: alerts.length })}
      </p>
      <p className="text-sm text-muted-foreground">{t("fiscal.alertsHint")}</p>
      <ul className="space-y-1">
        {alerts.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">{t(`fiscal.alertKinds.${a.kind}`, { defaultValue: a.kind })}</span>
              {a.documentNo && <span className="ml-1">({a.documentNo})</span>}
              <span className="block text-xs text-muted-foreground">
                {formatDateTime(a.createdAt)} · {a.detail}
              </span>
            </span>
            <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate(a.id)}>
              {t("fiscal.alertChecked")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
