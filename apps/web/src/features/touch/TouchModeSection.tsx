import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTouchModeStore } from "./touch-mode";

/** This device: touch mode on or off (kept on this device, for whoever signs in). */
export function TouchModeSection() {
  const { t } = useTranslation("device");
  const enabled = useTouchModeStore((s) => s.enabled);
  const setEnabled = useTouchModeStore((s) => s.setEnabled);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("touch.title")}</CardTitle>
        <CardDescription>{t("touch.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t("touch.toggle")}
        </label>
      </CardContent>
    </Card>
  );
}
