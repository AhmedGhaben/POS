import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ShiftTerminalExceptionDto } from "@pos/shared";
import { formatDateTime } from "@/lib/format";

const OPERATIONS = ["sale", "shift-open", "cash-movement", "shift-close"] as const;

/**
 * For managers, in a shift's details: a till's work that landed in a shift
 * that isn't that till's (kept as it happened, flagged by the server).
 */
export function ShiftTerminalExceptions({ items }: { items: ShiftTerminalExceptionDto[] }) {
  const { t } = useTranslation("shifts");
  if (items.length === 0) return null;
  return (
    <section className="sb-notice space-y-2 p-3 text-sm" aria-labelledby="shift-exceptions-title" data-testid="shift-terminal-exceptions">
      <h3 id="shift-exceptions-title" className="flex items-center gap-2 font-semibold">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
        {t("exceptions.title")} <span className="font-normal text-muted-foreground tabular-nums">({items.length})</span>
      </h3>
      <p className="text-muted-foreground">{t("exceptions.description")}</p>
      <ul className="space-y-1">
        {items.map((e) => {
          const op = (OPERATIONS as readonly string[]).includes(e.operation) ? (e.operation as (typeof OPERATIONS)[number]) : "sale";
          return (
            <li key={e.id}>
              {t("exceptions.line", {
                what: t(`exceptions.operation.${op}`),
                till: e.tillCode ?? "—",
                shift: e.shiftTillCode ? t("exceptions.tillShift", { till: e.shiftTillCode }) : t("exceptions.browserShift"),
              })}{" "}
              <span className="text-muted-foreground">
                · {e.offline ? t("exceptions.offline") : t("exceptions.online")} · {formatDateTime(e.at)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
