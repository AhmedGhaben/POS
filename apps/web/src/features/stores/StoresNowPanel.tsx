import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDiamond } from "@/components/ui/status-diamond";
import { useAuthStore } from "@/features/auth/store";
import { useStoreDetails, useStoresStatus } from "./api";
import { diamondFor, storeLine } from "./status-view";

/**
 * "Lojas agora" on the dashboard: each store's Windows tills, from what the
 * server last heard. Clicking a store opens its tills.
 */
export function StoresNowPanel() {
  const { t } = useTranslation("reports");
  const role = useAuthStore((s) => s.user?.role);
  const status = useStoresStatus();
  const open = useStoreDetails((s) => s.open);
  const stores = status.data;

  return (
    <Card id="lojas-agora">
      <CardHeader>
        <CardTitle className="text-base">{t("storesNow.title")}</CardTitle>
        <CardDescription>{t("storesNow.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {!stores ? (
          <p className="text-sm text-muted-foreground">{status.isError ? t("storesNow.error") : t("storesNow.loading")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {stores.map((store) => (
              <li key={store.storeId} className="flex flex-col rounded-xl border">
                <button
                  type="button"
                  onClick={() => open(store.storeId)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${t("storesNow.open", { store: store.name })}: ${storeLine(t, store)}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{store.name}</span>
                    <StatusDiamond
                      state={diamondFor(store.status)}
                      className="mt-0.5 items-start text-sm text-muted-foreground [&>svg]:mt-1"
                      label={storeLine(t, store)}
                    />
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
                {store.status === "never" && role === "OWNER" && (
                  <Link to="/settings" className="px-4 pb-3 text-sm font-medium text-sb-link underline-offset-4 hover:underline">
                    {t("storesNow.line.setUp")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
