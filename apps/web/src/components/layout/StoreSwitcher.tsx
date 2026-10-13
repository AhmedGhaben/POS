import { Combobox } from "@/components/ui/combobox";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/features/auth/store";

export function StoreSwitcher() {
  const { t } = useTranslation();
  const stores = useAuthStore((s) => s.stores);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const setCurrentStoreId = useAuthStore((s) => s.setCurrentStoreId);

  // Fewer clicks for single-store staff: hide the switcher entirely.
  if (stores.length <= 1) {
    return null;
  }

  return (
    <Combobox
      value={currentStoreId ?? undefined}
      onChange={(v) => v !== null && setCurrentStoreId(v)}
      placeholder={t("shell.selectStore")}
      className="w-[200px]"
      options={stores.map((store) => ({ value: store.id, label: store.name }))}
    />
  );
}
