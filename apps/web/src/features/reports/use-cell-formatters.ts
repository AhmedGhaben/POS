import * as React from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/features/auth/store";
import { documentTitle } from "@/features/fiscal/fiscal-text";
import { currentLanguage } from "@/i18n";
import { formatCalendarDate, formatMoney, formatMonth, formatQuantity } from "@/lib/format";
import type { CellFormatters } from "./report-cells";

/** Cells in a language: the screen's on the page, the document language when printed or exported. */
export function useCellFormatters(lang: string = currentLanguage()): CellFormatters {
  const { t } = useTranslation(["reports", "common", "accounts"], { lng: lang });
  const currency = useAuthStore((s) => s.business?.currency ?? "USD");
  const country = useAuthStore((s) => s.business?.country ?? null);
  return React.useMemo(() => {
    const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
    return {
      money: (v) => formatMoney(v, currency, lang),
      quantity: (v) => formatQuantity(v, null, lang),
      number: (v) => number.format(v),
      date: (v) => formatCalendarDate(v),
      month: (v) => formatMonth(v, lang),
      code: (kind, v) =>
        kind === "method"
          ? t(`common:paymentMethods.${v}`, { defaultValue: v })
          : kind === "docType"
            ? `${v} · ${documentTitle(v as Parameters<typeof documentTitle>[0], country)}`
            : t(`accounts:agt.statuses.${v}`, { defaultValue: v }),
      none: "—",
    };
  }, [t, currency, country, lang]);
}

