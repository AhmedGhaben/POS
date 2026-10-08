import * as React from "react";
import { useAuthStore } from "@/features/auth/store";
import { formatCurrency, formatMoney } from "@/lib/format";

/** The business currency, from the cached session (works offline). */
export function useCurrency(): string {
  return useAuthStore((s) => s.business?.currency ?? "USD");
}

/** Formatter for exact amounts in the business currency. */
export function useMoney(): (value: number | string) => string {
  const currency = useCurrency();
  return React.useCallback((value: number | string) => formatMoney(value, currency), [currency]);
}

/** Formatter for compact figures (stat tiles, chart axes). */
export function useCompactMoney(): (value: number) => string {
  const currency = useCurrency();
  return React.useCallback((value: number) => formatCurrency(value, currency), [currency]);
}

/** Non-hook read, for render callbacks that libraries may call as plain functions (chart tooltips). */
export function currentCurrency(): string {
  return useAuthStore.getState().business?.currency ?? "USD";
}
