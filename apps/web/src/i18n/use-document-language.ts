import * as React from "react";
import { useTranslation } from "react-i18next";
import { documentLanguageFor } from "@pos/shared";
import { useAuthStore } from "@/features/auth/store";
import { formatMoney, formatQuantity } from "@/lib/format";
import { dateLocaleFor, formatCalendarDate, formatDate, formatDateTime, formatMonth } from "@/lib/dates";
import { DEFAULT_LANGUAGE, isLanguage, type Language } from "./index";

/**
 * The language a store's documents are in: its "Idioma dos documentos",
 * else its country's (AO → pt-AO), else the business's. `storeId` picks
 * the store the document belongs to; without one, the store being worked
 * in, or the business's country for business-wide reports.
 */
export function documentLanguage(storeId?: string | null): Language {
  const { business, stores, currentStoreId } = useAuthStore.getState();
  return resolve(business, stores, storeId === undefined ? currentStoreId : storeId);
}

function resolve(
  business: ReturnType<typeof useAuthStore.getState>["business"],
  stores: ReturnType<typeof useAuthStore.getState>["stores"],
  storeId: string | null,
): Language {
  const store = storeId ? stores.find((s) => s.id === storeId) : null;
  const lang = documentLanguageFor(store ?? { country: business?.country }, business?.language);
  return isLanguage(lang) ? lang : DEFAULT_LANGUAGE;
}

/** The document language, kept up to date (see documentLanguage). For translations from other files: `useTranslation(ns, { lng })`. */
export function useDocumentLang(storeId?: string | null): Language {
  const business = useAuthStore((s) => s.business);
  const stores = useAuthStore((s) => s.stores);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  return resolve(business, stores, storeId === undefined ? currentStoreId : storeId);
}

/**
 * Receipts, quotes, invoices, shift reports, reports and their exports,
 * and the customer display are for the shop's customers, its accountant
 * and AGT, so they use the store's document language, never the screen
 * language of whoever prints them. Same for their money and dates (the
 * store's country: 17/10/2026 14:05 in Angola). `storeId` as for
 * documentLanguage.
 */
export function useDocumentLanguage(currency?: string, storeId?: string | null) {
  const business = useAuthStore((s) => s.business);
  const stores = useAuthStore((s) => s.stores);
  const currentStoreId = useAuthStore((s) => s.currentStoreId);
  const id = storeId === undefined ? currentStoreId : storeId;
  const lang = resolve(business, stores, id);
  const store = id ? stores.find((s) => s.id === id) : null;
  const locale = dateLocaleFor(store?.country ?? business?.country);
  const cur = currency ?? business?.currency ?? "USD";
  const { t } = useTranslation(["documents", "common"], { lng: lang });
  return React.useMemo(
    () => ({
      t,
      lang,
      money: (value: number | string) => formatMoney(value, cur, lang),
      qty: (value: number | string, unit?: string | null) => formatQuantity(value, unit, lang),
      dateTime: (value: string | Date) => formatDateTime(value, locale),
      date: (value: string | Date) => formatDate(value, locale),
      calendarDate: (value: string) => formatCalendarDate(value, locale),
      month: (value: string) => formatMonth(value, lang),
    }),
    [t, lang, cur, locale],
  );
}
