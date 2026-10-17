import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/features/auth/store";
import { useShiftStore } from "@/features/shifts/shift-store";
import { defaultDeviceRole, useDeviceRole, useDeviceRoleStore, type DeviceRole } from "../device-role";

const ROLES: DeviceRole[] = ["TILL", "BACK_OFFICE"];

/**
 * What this device is for: a till (sells, opens shifts with a float) or
 * back office (dashboard, reports, products, settings, accounting; never a
 * shift). Owners and managers choose; not while a shift is open here.
 */
export function DeviceRoleSection() {
  const { t } = useTranslation("device");
  const role = useDeviceRole();
  const setRole = useDeviceRoleStore((s) => s.setRole);
  const userRole = useAuthStore((s) => s.user?.role);
  const canChange = userRole === "OWNER" || userRole === "MANAGER";
  const shiftOpen = useShiftStore((s) => !!s.current);

  function choose(next: DeviceRole) {
    if (next === role) return;
    if (next === "BACK_OFFICE" && shiftOpen) {
      toast.error(t("role.closeShiftFirst"));
      return;
    }
    setRole(next);
    toast.success(t(`role.saved.${next}`));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("role.title")}</CardTitle>
        <CardDescription>{t("role.description", { default: t(`role.names.${defaultDeviceRole()}`) })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3" role="radiogroup" aria-label={t("role.title")}>
        {ROLES.map((r) => (
          <label key={r} className="flex items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary">
            <input
              type="radio"
              name="device-role"
              className="mt-0.5 h-4 w-4"
              checked={role === r}
              disabled={!canChange}
              onChange={() => choose(r)}
            />
            <span>
              <span className="font-medium">{t(`role.names.${r}`)}</span>
              <span className="block text-muted-foreground">{t(`role.hints.${r}`)}</span>
            </span>
          </label>
        ))}
        {!canChange && <p className="text-sm text-muted-foreground">{t("role.managersOnly")}</p>}
      </CardContent>
    </Card>
  );
}
