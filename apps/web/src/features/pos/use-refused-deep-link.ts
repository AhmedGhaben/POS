import * as React from "react";
import { useLocation } from "react-router-dom";
import type { OutboxEntry } from "@/lib/offline-db";
import { HIGHLIGHT_MS, REFUSED_ANCHOR, highlightTarget, prefersReducedMotion, scrollBehavior } from "./refused-link";

/**
 * Arriving from the red sync-error indicator (/device#sync-refused): once
 * the refused entries have loaded, scroll to the one the link names (or the
 * oldest), move focus to it, and outline it briefly. Once per visit.
 */
export function useRefusedDeepLink(entries: OutboxEntry[] | undefined): string | null {
  const location = useLocation();
  const [highlightedId, setHighlightedId] = React.useState<string | null>(null);
  const handled = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (location.hash !== `#${REFUSED_ANCHOR}` || !entries || handled.current === location.key) return;
    handled.current = location.key;
    const target = highlightTarget(entries, new URLSearchParams(location.search).get("entry"));
    if (!target) return;
    const el = document.querySelector<HTMLElement>(`[data-outbox-entry="${CSS.escape(target)}"]`);
    el?.scrollIntoView({ behavior: scrollBehavior(prefersReducedMotion()), block: "center" });
    el?.focus({ preventScroll: true });
    setHighlightedId(target);
  }, [entries, location.hash, location.key, location.search]);

  React.useEffect(() => {
    if (!highlightedId) return;
    const timer = setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightedId]);

  return highlightedId;
}
