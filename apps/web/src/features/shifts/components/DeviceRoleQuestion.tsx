import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useDeviceRoleStore } from "@/features/desktop/device-role";

/**
 * A browser nobody has set up yet, on the POS screen: an owner or manager
 * is asked once whether it's a till or back office (saved on the device,
 * changeable in This device); anyone else is told to ask a manager.
 */
export function DeviceRoleQuestion({ canChoose }: { canChoose: boolean }) {
  const { t } = useTranslation("shifts");
  const setRole = useDeviceRoleStore((s) => s.setRole);
  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid="device-role-question">
      {canChoose ? (
        <>
          <div>
            <p className="font-semibold">{t("deviceRole.question")}</p>
            <p className="text-sm text-muted-foreground">{t("deviceRole.hint")}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={() => setRole("TILL")}>
              {t("deviceRole.till")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setRole("BACK_OFFICE")}>
              {t("deviceRole.backOffice")}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm font-medium">{t("deviceRole.askManager")}</p>
      )}
    </div>
  );
}
