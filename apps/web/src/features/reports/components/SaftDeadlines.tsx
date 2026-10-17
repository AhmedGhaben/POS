import { countryConfig } from "@pos/shared";
import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAccountingStatus, STATUS_KEY } from "@/features/accounting/api";
import { useAuthStore } from "@/features/auth/store";
import { formatCalendarDate, formatMonth } from "@/lib/format";
import { todayIn, upcomingDeadlines } from "../export-periods";

/**
 * SAF-T files due soon (the monthly invoicing file while e-invoicing is
 * off; last year's inventory until 15 February), with a link to make them.
 */
export function SaftDeadlines({ link = true }: { link?: boolean }) {
  const { t } = useTranslation("reports");
  const business = useAuthStore((s) => s.business);
  const stores = useAuthStore((s) => s.stores);
  const config = countryConfig(business?.country ?? null);
  const role = useAuthStore((s) => s.user?.role);
  const accounting = useQuery({ queryKey: STATUS_KEY, queryFn: fetchAccountingStatus, enabled: role === "OWNER" || role === "MANAGER", retry: false, staleTime: 5 * 60_000 });
  if (!business || !config) return null;
  const today = todayIn(config.timeZone);
  const deadlines = upcomingDeadlines(
    today,
    config,
    {
      eInvoicingActive: !!business.eInvoicingActive,
      regimes: stores.map((s) => s.ivaRegime ?? "GERAL"),
      accountingEnabled: !!accounting.data?.enabled,
      purchasesFile: accounting.data?.settings?.purchasesFile,
    },
    5,
  );
  if (!deadlines.length) return null;
  return (
    <div className="space-y-2" role="status">
      {deadlines.map((d) => (
        <div
          key={d.key}
          className={`flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 text-sm ${d.overdue ? "border-destructive/50 bg-destructive/10" : "border-amber-500/40 bg-amber-500/10"}`}
        >
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">
            {t(`deadlines.${d.key as "saftInvoicing"}`, {
              covers: d.key === "saftAccounting" ? d.covers.slice(0, 4) : d.key === "saftInventory" ? formatCalendarDate(d.covers) : formatMonth(d.covers),
              due: formatCalendarDate(d.due),
            })}
            {d.overdue && <strong> {t("deadlines.overdue")}</strong>}
          </span>
          {link && (
            <Link to={d.key === "saftAccounting" || d.key === "saftPurchases" ? "/accounting?tab=saft" : "/reports?tab=files"} className="font-medium underline underline-offset-4">
              {t("deadlines.makeIt")}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
