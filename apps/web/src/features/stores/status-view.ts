import type { TFunction } from "i18next";
import type { StoreStatusDto, StoreSyncStatus, TillSyncStatus } from "@pos/shared";
import type { DiamondState } from "@/components/ui/status-diamond";
import { statusWhen, type StatusWhen } from "./status-time";

/**
 * How "Lojas agora" shows a status. Only "offline" is ever amber; a store
 * selling in a browser, or without a Windows till, is muted and never an
 * alarm.
 */
export function diamondFor(status: StoreSyncStatus | TillSyncStatus): DiamondState {
  switch (status) {
    case "online":
      return "online";
    case "syncing":
      return "syncing";
    case "offline":
      return "offline";
    default:
      return "inactive";
  }
}

/** Stores in the banner and the logo count: Windows tills that went quiet with a shift open. */
export function offlineStores(stores: StoreStatusDto[] | undefined): StoreStatusDto[] {
  return (stores ?? []).filter((s) => s.status === "offline");
}

type Translate = TFunction<"reports">;

function when(t: Translate, form: "at" | "since" | "sinceAt", w: StatusWhen): string {
  return t(`storesNow.${form}.${w.kind}`, { time: w.time, date: w.date });
}

/** "às 14:09" / "ontem às 21:04" / "16/11 às 09:30", on the store's clock. */
export function whenText(t: Translate, form: "at" | "since" | "sinceAt", iso: string, store: StoreStatusDto, now?: Date): string {
  return when(t, form, statusWhen(iso, store, now));
}

/**
 * The line under a store's name. Says only what the server can know: when
 * it last heard from the till, never live facts it can't see while offline.
 */
export function storeLine(t: Translate, store: StoreStatusDto, now?: Date): string {
  const at = (iso: string | null) => (iso ? whenText(t, "at", iso, store, now) : null);
  switch (store.status) {
    case "online": {
      const synced = at(store.lastSyncSuccessAt);
      return synced ? t("storesNow.line.online", { at: synced }) : t("storesNow.line.onlineNoSync");
    }
    case "syncing": {
      const synced = at(store.lastSyncSuccessAt);
      return synced ? t("storesNow.line.syncing", { at: synced }) : t("storesNow.line.syncingNoSync");
    }
    case "offline":
      return t("storesNow.line.offline", { since: store.lastSeenAt ? whenText(t, "since", store.lastSeenAt, store, now) : "—" });
    case "inactive":
      return t("storesNow.line.inactive", { at: at(store.lastSeenAt) ?? "—" });
    case "never":
      return t("storesNow.line.never");
    case "browser":
      return t("storesNow.line.browser");
    case "noTill":
      return t("storesNow.line.noTill");
  }
}
