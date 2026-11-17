import type { TFunction } from "i18next";
import type { OutboxKind } from "@/lib/offline-db";

/**
 * What the red sync-error indicator should call the refused uploads: a sale,
 * a shift close, a cash movement… or, when they differ, "operations".
 * Wording only: reads the kinds, changes nothing.
 */
export const KIND_KEY = {
  sale: "sale",
  "void-sale": "voidSale",
  "drawer-event": "drawerEvent",
  "shift-open": "shiftOpen",
  "cash-movement": "cashMovement",
  "shift-close": "shiftClose",
} as const satisfies Record<OutboxKind, string>;

export type KindKey = (typeof KIND_KEY)[OutboxKind];

export function failedSummary(kinds: readonly OutboxKind[]): { key: KindKey | "mixed"; count: number } | null {
  if (kinds.length === 0) return null;
  const distinct = new Set(kinds);
  return { key: distinct.size === 1 ? KIND_KEY[kinds[0]] : "mixed", count: kinds.length };
}

/**
 * "1 fecho de turno não sincronizou", "2 vendas não sincronizaram",
 * "2 operações não sincronizaram". While the kinds are still being read,
 * the neutral "operações" wording with the count the till already has.
 */
export function failedLabel(t: TFunction<"pos">, kinds: readonly OutboxKind[] | undefined, failedCount: number): string {
  const summary = failedSummary(kinds ?? []);
  return summary ? t(`sync.failedKind.${summary.key}`, { count: summary.count }) : t("sync.failedKind.mixed", { count: failedCount });
}
