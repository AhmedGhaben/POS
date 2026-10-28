import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PrintFormat } from "@/components/print/PrintArea";

/** Receipt / A4 for the sale just made; the choice is kept on this till (tester #35). */
export function SalePrintToggle({ value, onChange, a4Disabled = false }: { value: PrintFormat; onChange: (format: PrintFormat) => void; a4Disabled?: boolean }) {
  const { t } = useTranslation("pos");
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as PrintFormat)}>
      <TabsList className="grid w-full grid-cols-2" aria-label={t("complete.format")}>
        <TabsTrigger value="receipt">{t("complete.receiptFormat")}</TabsTrigger>
        <TabsTrigger value="a4" disabled={a4Disabled}>
          {t("complete.a4Format")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
