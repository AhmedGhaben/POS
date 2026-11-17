import { countryConfig } from "@pos/shared";
import { CalendarClock, CalendarX2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAccountingStatus, STATUS_KEY } from "@/features/accounting/api";
import { useAuthStore } from "@/features/auth/store";
import { formatCalendarDate, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { todayIn, upcomingDeadlines, type Deadline } from "../export-periods";
import { deadlineRoute, groupDeadlines, type DeadlineGroup } from "../deadline-groups";

/** Quiet when there's time; stronger (still neutral) in the last week; error colour once it has passed. */
const LEVEL_CLASS: Record<DeadlineGroup["level"], string> = {
  later: "sb-notice",
  soon: "rounded-xl border-[1.5px] border-foreground bg-card text-foreground",
  passed: "sb-error",
};

function covers(d: Deadline): string {
  return d.key === "saftAccounting" ? d.covers.slice(0, 4) : d.key === "saftInventory" ? formatCalendarDate(d.covers) : formatMonth(d.covers);
}

/** One notice per due date, listing each file with its own action. */
export function DeadlineNotice({ group, link = true }: { group: DeadlineGroup; link?: boolean }) {
  const { t } = useTranslation("reports");
  const due = formatCalendarDate(group.due);
  const passed = group.level === "passed";
  const titleId = `saft-deadline-${group.due}`;
  const Icon = passed ? CalendarX2 : CalendarClock;
  return (
    <section
      aria-labelledby={titleId}
      data-level={group.level}
      className={cn("px-4 py-3 text-sm", LEVEL_CLASS[group.level])}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Icon className={cn("h-4 w-4 shrink-0", group.level === "later" && "text-muted-foreground")} aria-hidden />
        <h2 id={titleId} className={cn("flex-1 text-sm tracking-normal", group.level === "later" ? "font-medium" : "font-bold")}>
          {passed ? t("deadlines.groupPassed", { due }) : t("deadlines.groupDue", { due })}
        </h2>
        {!passed && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs tabular-nums",
              group.level === "soon" ? "bg-sb-chip font-bold text-foreground" : "bg-sb-chip font-medium text-foreground",
            )}
          >
            {group.daysLeft === 0 ? t("deadlines.dueToday") : t("deadlines.daysLeft", { count: group.daysLeft })}
          </span>
        )}
      </div>
      {passed && <p className="mt-1 pl-7">{t("deadlines.passedNote")}</p>}
      <ul className="mt-1 pl-7" aria-label={t("deadlines.files")}>
        {group.items.map((d) => {
          const file = t(`deadlines.file.${d.key as "saftInvoicing"}`, { covers: covers(d) });
          return (
            <li key={d.key} className="flex flex-wrap items-center justify-between gap-x-3">
              <span className="py-1">{file}</span>
              {link && (
                <Link
                  to={deadlineRoute(d.key)}
                  aria-label={t("deadlines.makeItFor", { file })}
                  className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 sm:min-h-8"
                >
                  {t("deadlines.makeIt")}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * SAF-T files due soon (the monthly invoicing file while e-invoicing is
 * off; last year's inventory until 15 February), with a link to make each.
 * Which files and when is unchanged (upcomingDeadlines); only the display
 * groups them by due date. The app doesn't know whether a file was
 * submitted to AGT, so a passed deadline never says it wasn't.
 */
export function SaftDeadlines({ link = true }: { link?: boolean }) {
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
      purchasesFileDueDay: accounting.data?.settings?.purchasesFileDueDay,
    },
    5,
  );
  if (!deadlines.length) return null;
  return (
    <div className="space-y-2" role="status">
      {groupDeadlines(deadlines, today).map((group) => (
        <DeadlineNotice key={group.due} group={group} link={link} />
      ))}
    </div>
  );
}
