import * as React from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

/** Registers the service worker and surfaces the two states the cashier
 * actually needs to know about: the app can now run offline, or a new
 * build is available and needs a reload to take over. */
export function PwaUpdatePrompt() {
  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();
  const [wasOfflineReady] = offlineReady;
  const [wasNeedRefresh] = needRefresh;

  React.useEffect(() => {
    if (wasOfflineReady) {
      toast.success("App ready to work offline");
    }
  }, [wasOfflineReady]);

  React.useEffect(() => {
    if (wasNeedRefresh) {
      toast("A new version is available", {
        action: {
          label: "Reload",
          onClick: () => updateServiceWorker(true),
        },
        duration: Infinity,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasNeedRefresh]);

  return null;
}
