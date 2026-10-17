import { useTranslation } from "react-i18next";
import { formatMonth } from "@/lib/format";

/** "outubro de 2026" for months; Abertura, Regularizações, Apuramento de resultados, Resultado líquido for the others. */
export function usePeriodName() {
  const { t, i18n } = useTranslation("accounting");
  return (year: number, number: number) => {
    if (number >= 1 && number <= 12) return formatMonth(`${year}-${String(number).padStart(2, "0")}`, i18n.language);
    return t(`periods.special.p${number as 0 | 13 | 14 | 15}`);
  };
}
