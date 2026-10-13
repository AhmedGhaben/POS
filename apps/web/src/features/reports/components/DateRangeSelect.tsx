import { useTranslation } from "react-i18next";
import { Combobox } from "@/components/ui/combobox";

interface DateRangeSelectProps {
  days: number;
  onChange: (days: number) => void;
}

const PRESETS = [7, 30, 90];

export function DateRangeSelect({ days, onChange }: DateRangeSelectProps) {
  const { t } = useTranslation("reports");
  return (
    <Combobox
      value={String(days)}
      onChange={(v) => v !== null && onChange(Number(v))}
      className="w-[160px]"
      options={PRESETS.map((preset) => ({ value: String(preset), label: t("lastDays", { count: preset }) }))}
    />
  );
}
