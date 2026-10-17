import { apiClient } from "@/lib/api-client";

/** Contabilidade (docs/ACCOUNTING-DECISIONS.md). */

export type Grouping = "PER_DOCUMENT" | "DAILY_SUMMARY";
export type PurchasesFileRule = "AUTO" | "ALWAYS" | "NEVER";
export type AccountCategory = "GR" | "GA" | "GM" | "AR" | "AA" | "AM";
export type LinkType = "CUSTOMER" | "SUPPLIER" | "TILL" | "BANK";

export interface AccountingSettingsDto {
  startDate: string;
  cashPerTill: boolean;
  grouping: Grouping;
  autoPost: boolean;
  purchasesFile: PurchasesFileRule;
  enabledAt: string | null;
}

export interface AccountingStatusDto {
  enabled: boolean;
  settings: AccountingSettingsDto | null;
  accounts: number;
  /** Today on the business's clock (YYYY-MM-DD). */
  today: string;
}

export interface LedgerAccountDto {
  id: string;
  code: string;
  name: string;
  category: AccountCategory;
  parentId: string | null;
  classNo: number;
  isActive: boolean;
  linkType: LinkType | null;
  linkId: string | null;
  fromTemplate: boolean;
  hasMovements: boolean;
}

export const ACCOUNTING_KEY = ["accounting"] as const;
export const STATUS_KEY = [...ACCOUNTING_KEY, "status"] as const;
export const ACCOUNTS_KEY = [...ACCOUNTING_KEY, "accounts"] as const;

export const fetchAccountingStatus = () => apiClient.get<AccountingStatusDto>("/accounting/status");
export const updateAccountingSettings = (body: Partial<AccountingSettingsDto> & { enabled?: boolean }) =>
  apiClient.patch<AccountingStatusDto>("/accounting/settings", body);

export const fetchAccounts = () => apiClient.get<LedgerAccountDto[]>("/accounting/accounts");
export const createAccount = (body: { code: string; name: string }) => apiClient.post<LedgerAccountDto>("/accounting/accounts", body);
export const updateAccount = (id: string, body: { name?: string; isActive?: boolean }) => apiClient.patch<LedgerAccountDto>(`/accounting/accounts/${id}`, body);
export const removeAccount = (id: string) => apiClient.delete<{ removed: boolean }>(`/accounting/accounts/${id}`);
export const syncAccounts = () => apiClient.post<{ created: number }>("/accounting/accounts/sync");

/** PGC classes, for headings. */
export const PGC_CLASSES: Record<number, string> = {
  1: "Meios fixos e investimentos",
  2: "Existências",
  3: "Terceiros",
  4: "Meios monetários",
  5: "Capital e reservas",
  6: "Proveitos e ganhos por natureza",
  7: "Custos e perdas por natureza",
  8: "Resultados",
};
