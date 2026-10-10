import * as React from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import i18n from "@/i18n";

/** Registers the service worker and surfaces the two states the cashier
 * actually needs to know about: the app can now run offline, or a new
 * build is available and needs a reload to take over. */
export function PwaUpdatePrompt() {
  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();
  const [wasOfflineReady] = offlineReady;
  const [wasNeedRefresh] = needRefresh;

  React.useEffect(() => {
    if (wasOfflineReady) {
      toast.success(i18n.t("shell.offlineReady"));
    }
  }, [wasOfflineReady]);

  React.useEffect(() => {
    if (wasNeedRefresh) {
      toast(i18n.t("shell.newVersion"), {
        action: {
          label: i18n.t("shell.reload"),
          onClick: () => updateServiceWorker(true),
        },
        duration: Infinity,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasNeedRefresh]);

  return null;
}
