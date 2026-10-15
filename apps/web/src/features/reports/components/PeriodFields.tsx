import { useTranslation } from "react-i18next";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PeriodValue } from "../export-periods";

/** A month (the usual SAF-T period) or any start and end date. */
export function PeriodFields({ id, value, onChange }: { id: string; value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const { t } = useTranslation("reports");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${id}-mode`}>{t("exports.period")}</Label>
        <Combobox
          id={`${id}-mode`}
          value={value.mode}
          onChange={(v) => v && onChange({ ...value, mode: v as PeriodValue["mode"] })}
          options={[
            { value: "month", label: t("exports.periodMonth") },
            { value: "range", label: t("exports.periodRange") },
          ]}
        />
      </div>
      {value.mode === "month" ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-month`}>{t("exports.month")}</Label>
          <Input id={`${id}-month`} type="month" value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value })} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor={`${id}-start`}>{t("exports.startDate")}</Label>
            <Input id={`${id}-start`} type="date" value={value.startDate} onChange={(e) => onChange({ ...value, startDate: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-end`}>{t("exports.endDate")}</Label>
            <Input id={`${id}-end`} type="date" value={value.endDate} onChange={(e) => onChange({ ...value, endDate: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}
