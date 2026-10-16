import { countryConfig } from "@pos/shared";
import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/features/auth/store";
import { formatCalendarDate } from "@/lib/format";
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
  if (!business || !config) return null;
  const today = todayIn(config.timeZone);
  const deadlines = upcomingDeadlines(today, config, { eInvoicingActive: !!business.eInvoicingActive, regimes: stores.map((s) => s.ivaRegime ?? "GERAL") }, 5);
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
            {t(d.key === "saftInventory" ? "deadlines.saftInventory" : "deadlines.saftInvoicing", {
              covers: d.key === "saftInvoicing" ? formatCalendarDate(`${d.covers}-01`, { month: "long", year: "numeric" }) : formatCalendarDate(d.covers, { dateStyle: "long" }),
              due: formatCalendarDate(d.due, { dateStyle: "long" }),
            })}
            {d.overdue && <strong> {t("deadlines.overdue")}</strong>}
          </span>
          {link && (
            <Link to="/reports?tab=files" className="font-medium underline underline-offset-4">
              {t("deadlines.makeIt")}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
