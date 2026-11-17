import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { OutboxEntry } from "@/lib/offline-db";
import { cn } from "@/lib/utils";
import { REFUSED_ANCHOR } from "../refused-link";
import { KIND_KEY } from "../failed-summary";

interface RefusedListProps {
  entries: OutboxEntry[];
  /** The entry outlined right now (deep link), if any. */
  highlightedId: string | null;
  onRetry: (clientId: string) => void;
}

/**
 * "Sales the server refused": each entry with when it was made, the
 * server's reason and a Retry button (retrying is always the person's
 * choice). Each entry can take focus, so the deep link can move the
 * keyboard there.
 */
export function RefusedList({ entries, highlightedId, onRetry }: RefusedListProps) {
  const { t } = useTranslation(["device", "common", "pos"]);
  return (
    <section id={REFUSED_ANCHOR} className="scroll-mt-20 space-y-2" aria-labelledby={`${REFUSED_ANCHOR}-title`}>
      <h3 id={`${REFUSED_ANCHOR}-title`} className="text-sm font-semibold">
        {t("sync.refused")} <span className="font-normal text-muted-foreground tabular-nums">({entries.length})</span>
      </h3>
      <p className="text-sm text-muted-foreground">{t("sync.refusedHint")}</p>
      <ul className="space-y-2">
        {entries.map((entry) => {
          const when = formatDateTime(entry.createdAt);
          // What was refused: a sale, a shift close, a cash movement…
          const what = t(`pos:sync.kindName.${KIND_KEY[entry.kind]}`);
          const highlighted = entry.clientId === highlightedId;
          return (
            <li
              key={entry.clientId}
              data-outbox-entry={entry.clientId}
              data-highlighted={highlighted || undefined}
              tabIndex={-1}
              aria-label={t("sync.refusedEntry", { what, when, reason: entry.lastError ?? "" })}
              aria-current={highlighted ? "true" : undefined}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border p-3 text-sm outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                // A subtle outline in the error colour, fading out (no fade with reduced motion).
                "outline-offset-2 motion-safe:transition-[outline-color] motion-safe:duration-500",
                highlighted ? "outline outline-2 outline-destructive/70" : "outline-transparent",
              )}
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {what} <span className="font-normal text-muted-foreground">· {when}</span>
                </p>
                <p className="text-muted-foreground [overflow-wrap:anywhere]">{entry.lastError}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onRetry(entry.clientId)}>
                {t("common:actions.retry")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
