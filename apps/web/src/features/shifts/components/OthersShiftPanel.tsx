import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { LocalShift } from "../ledger";

/**
 * Someone else's shift is still open on this till (they signed out, or
 * the app closed). Selling waits until it's closed: by them, or by a
 * manager, who counts the cash for them (a forced close).
 */
export function OthersShiftPanel({
  shift,
  canForceClose,
  onForceClose,
}: {
  shift: LocalShift;
  canForceClose: boolean;
  onForceClose: () => void;
}) {
  const { t } = useTranslation("shifts");
  return (
    <div className="sb-notice space-y-3 p-4">
      <div>
        <p className="font-semibold">{t("others.title", { name: shift.openedBy.name })}</p>
        <p className="text-sm">{t("others.description", { name: shift.openedBy.name, time: formatDateTime(shift.openedAt) })}</p>
      </div>
      {canForceClose ? (
        <Button type="button" variant="outline" className="w-full" onClick={onForceClose}>
          {t("others.forceClose", { name: shift.openedBy.name })}
        </Button>
      ) : (
        <p className="text-sm font-medium">{t("others.askManager")}</p>
      )}
    </div>
  );
}
