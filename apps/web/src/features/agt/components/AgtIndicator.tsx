import { useQuery } from "@tanstack/react-query";
import { CloudUpload, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/features/auth/store";
import { AGT_STATUS_KEY, fetchAgtStatus } from "../api";

/**
 * In the back office's top bar while e-invoicing is on: documents still on
 * their way to AGT, and any it rejected (those need someone).
 */
export function AgtIndicator() {
  const { t } = useTranslation("accounts");
  const role = useAuthStore((s) => s.user?.role);
  const active = useAuthStore((s) => !!s.business?.eInvoicingActive);
  const status = useQuery({
    queryKey: AGT_STATUS_KEY,
    queryFn: fetchAgtStatus,
    enabled: active && (role === "OWNER" || role === "MANAGER"),
    refetchInterval: 60_000,
  });
  const s = status.data;
  if (!s?.enabled || !s.businessActive) return null;
  const pending = s.counts.QUEUED + s.counts.SENT;
  const rejected = s.counts.REJECTED;
  if (!pending && !rejected) return null;
  return (
    <Link
      to="/agt"
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${rejected ? "border-destructive/50 bg-destructive/10 text-destructive" : "text-muted-foreground"}`}
      aria-label={t("agt.indicator", { pending, rejected })}
      title={t("agt.indicator", { pending, rejected })}
    >
      {rejected ? <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> : <CloudUpload className="h-3.5 w-3.5" aria-hidden />}
      {rejected ? t("agt.rejectedShort", { count: rejected }) : t("agt.pendingShort", { count: pending })}
    </Link>
  );
}
