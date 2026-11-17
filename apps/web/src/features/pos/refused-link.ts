/**
 * Deep link from the red sync-error indicator to This device → Server and
 * sync → "Sales the server refused". Reading only: nothing here retries,
 * deletes or changes an outbox entry.
 */

/** The anchor on the refused-sales list. */
export const REFUSED_ANCHOR = "sync-refused";
/** How long the entry the link points at stays outlined. */
export const HIGHLIGHT_MS = 2500;

/** /device#sync-refused, optionally naming the entry to show (?entry=<clientId>). */
export function refusedEntriesPath(clientId?: string): string {
  return `/device${clientId ? `?entry=${encodeURIComponent(clientId)}` : ""}#${REFUSED_ANCHOR}`;
}

/**
 * The entry to scroll to and outline: the one the link names if it's still
 * refused, otherwise the oldest refused one (the list is oldest first).
 */
export function highlightTarget(entries: { clientId: string }[], requested: string | null): string | null {
  if (entries.length === 0) return null;
  if (requested && entries.some((e) => e.clientId === requested)) return requested;
  return entries[0].clientId;
}

/** Smooth scrolling only for people who haven't asked for less motion. */
export function scrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
