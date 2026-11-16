import { useTranslation } from "react-i18next";
import type { StoreStatusDto, TillStatusDto } from "@pos/shared";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusDiamond } from "@/components/ui/status-diamond";
import { useStoreDetails, useStoresStatus } from "./api";
import { diamondFor, whenText } from "./status-view";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function Till({ till, store }: { till: TillStatusDto; store: StoreStatusDto }) {
  const { t } = useTranslation("reports");
  const at = (iso: string | null) => (iso ? whenText(t, "at", iso, store) : t("storesNow.details.never"));
  return (
    <li className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">
          {till.name} <span className="font-normal text-muted-foreground">· {till.code}</span>
        </p>
        <StatusDiamond state={diamondFor(till.status)} className="text-sm font-medium" label={t(`storesNow.device.${till.status}`)} />
      </div>
      <dl className="mt-2 divide-y">
        <Row label={t("storesNow.details.lastSeen")}>{at(till.lastSeenAt)}</Row>
        <Row label={t("storesNow.details.lastSync")}>{at(till.lastSyncSuccessAt)}</Row>
        <Row label={t("storesNow.details.pending")}>
          <span className="tabular-nums">{till.pendingCountReported}</span>
        </Row>
        <Row label={t("storesNow.details.version")}>{till.appVersion ?? "—"}</Row>
        <Row label={t("storesNow.details.shiftOpen")}>{till.hasOpenShift ? t("storesNow.details.shiftOpen") : t("storesNow.details.noShift")}</Row>
      </dl>
    </li>
  );
}

/** A store's tills ("Caixa 1 · Online, Caixa 2 · Sem ligação"), from "Lojas agora" or the banner. */
export function StoreDevicesSheet() {
  const { t } = useTranslation("reports");
  const storeId = useStoreDetails((s) => s.storeId);
  const open = useStoreDetails((s) => s.open);
  const store = useStoresStatus().data?.find((s) => s.storeId === storeId);

  return (
    <Sheet open={!!storeId} onOpenChange={(v) => !v && open(null)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {store && (
          <>
            <SheetHeader>
              <SheetTitle>{t("storesNow.details.title", { store: store.name })}</SheetTitle>
              <SheetDescription>{t("storesNow.details.description")}</SheetDescription>
            </SheetHeader>
            {store.devices.length === 0 ? (
              <div className="mt-6 space-y-2 text-sm">
                <p>{t("storesNow.details.empty")}</p>
                {store.status === "browser" && <p className="text-muted-foreground">{t("storesNow.details.browserNote")}</p>}
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {store.devices.map((till) => (
                  <Till key={till.terminalId} till={till} store={store} />
                ))}
              </ul>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
