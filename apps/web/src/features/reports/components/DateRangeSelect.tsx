import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DateRangeSelectProps {
  days: number;
  onChange: (days: number) => void;
}

const PRESETS = [7, 30, 90];

export function DateRangeSelect({ days, onChange }: DateRangeSelectProps) {
  const { t } = useTranslation("reports");
  return (
    <Select value={String(days)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRESETS.map((preset) => (
          <SelectItem key={preset} value={String(preset)}>
            {t("lastDays", { count: preset })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
