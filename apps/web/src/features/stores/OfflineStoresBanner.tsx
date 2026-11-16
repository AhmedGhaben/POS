import { useTranslation } from "react-i18next";
import { StatusDiamond } from "@/components/ui/status-diamond";
import { useStoreDetails, useStoresStatus } from "./api";
import { offlineStores, whenText } from "./status-view";

/**
 * On the dashboard while any store's till has gone quiet with its shift
 * open. Amber, the one colour that means "offline but still selling".
 * Disappears by itself when they reconnect. Stores selling in a browser or
 * without a Windows till never show here.
 */
export function OfflineStoresBanner() {
  const { t } = useTranslation("reports");
  const open = useStoreDetails((s) => s.open);
  const offline = offlineStores(useStoresStatus().data);
  if (offline.length === 0) return null;

  const one = offline.length === 1 ? offline[0] : null;
  const headline = one
    ? t("storesNow.banner.one", { store: one.name, since: one.lastSeenAt ? whenText(t, "sinceAt", one.lastSeenAt, one) : "—" })
    : t("storesNow.banner.many", { count: offline.length });

  return (
    <div role="status" className="sb-offline flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
      <StatusDiamond state="offline" size={12} className="font-semibold" label={headline} />
      <span className="flex-1">{t("storesNow.banner.body")}</span>
      {one ? (
        <button type="button" onClick={() => open(one.storeId)} className="font-semibold underline underline-offset-4">
          {t("storesNow.banner.viewOne", { store: one.name })}
        </button>
      ) : (
        <a href="#lojas-agora" className="font-semibold underline underline-offset-4">
          {t("storesNow.banner.viewMany")}
        </a>
      )}
    </div>
  );
}
