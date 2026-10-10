import * as React from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/features/auth/store";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { DEFAULT_LANGUAGE, isLanguage, type Language } from "./index";

/**
 * Receipts, quotes, invoices and the customer display are for the shop's
 * customers, so they use the business language (Settings → Business), not
 * the cashier's. Same for their money and date formats.
 */
export function useDocumentLanguage(currency?: string) {
  const business = useAuthStore((s) => s.business);
  const lang: Language = isLanguage(business?.language) ? business.language : DEFAULT_LANGUAGE;
  const cur = currency ?? business?.currency ?? "USD";
  const { t } = useTranslation(["documents", "common"], { lng: lang });
  return React.useMemo(
    () => ({
      t,
      lang,
      money: (value: number | string) => formatMoney(value, cur, lang),
      dateTime: (value: string | Date) => formatDateTime(value, lang),
      date: (value: string | Date) => formatDate(value, lang),
      longDate: (value: string | Date) => formatDate(value, lang, true),
    }),
    [t, lang, cur],
  );
}
