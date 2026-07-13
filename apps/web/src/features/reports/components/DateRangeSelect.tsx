import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DateRangeSelectProps {
  days: number;
  onChange: (days: number) => void;
}

const PRESETS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

export function DateRangeSelect({ days, onChange }: DateRangeSelectProps) {
  return (
    <Select value={String(days)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRESETS.map((preset) => (
          <SelectItem key={preset.value} value={String(preset.value)}>
            {preset.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
