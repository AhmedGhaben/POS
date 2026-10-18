import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/**
 * In place of "open the till" on a back-office device: it never opens a
 * shift, so it can't sell. An owner or manager can make it a till in This device.
 */
export function BackOfficeDevicePanel({ canChange }: { canChange: boolean }) {
  const { t } = useTranslation("shifts");
  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid="back-office-device">
      <div>
        <p className="font-semibold">{t("backOffice.title")}</p>
        <p className="text-sm text-muted-foreground">{t("backOffice.description")}</p>
      </div>
      {canChange ? (
        <Button asChild variant="outline" className="w-full">
          <Link to="/device">{t("backOffice.change")}</Link>
        </Button>
      ) : (
        <p className="text-sm font-medium">{t("backOffice.askManager")}</p>
      )}
    </div>
  );
}
