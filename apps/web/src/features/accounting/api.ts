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
export const YEARS_KEY = [...ACCOUNTING_KEY, "years"] as const;
export const JOURNALS_KEY = [...ACCOUNTING_KEY, "journals"] as const;
export const ENTRIES_KEY = [...ACCOUNTING_KEY, "entries"] as const;

export const fetchAccountingStatus = () => apiClient.get<AccountingStatusDto>("/accounting/status");
export const updateAccountingSettings = (body: Partial<AccountingSettingsDto> & { enabled?: boolean }) =>
  apiClient.patch<AccountingStatusDto>("/accounting/settings", body);

export const fetchAccounts = () => apiClient.get<LedgerAccountDto[]>("/accounting/accounts");
export const createAccount = (body: { code: string; name: string }) => apiClient.post<LedgerAccountDto>("/accounting/accounts", body);
export const updateAccount = (id: string, body: { name?: string; isActive?: boolean }) => apiClient.patch<LedgerAccountDto>(`/accounting/accounts/${id}`, body);
export const removeAccount = (id: string) => apiClient.delete<{ removed: boolean }>(`/accounting/accounts/${id}`);
export const syncAccounts = () => apiClient.post<{ created: number }>("/accounting/accounts/sync");

export type PeriodStatus = "OPEN" | "CLOSED";

export interface AccountingPeriodDto {
  number: number;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  closedAt: string | null;
  closedBy: string | null;
}

export interface FiscalYearDto {
  year: number;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  closedAt: string | null;
  closedBy: string | null;
  periods: AccountingPeriodDto[];
}

export const fetchFiscalYears = () => apiClient.get<FiscalYearDto[]>("/accounting/years");
export const createFiscalYear = (year: number) => apiClient.post<FiscalYearDto>("/accounting/years", { year });
export const closePeriod = (year: number, number: number) => apiClient.post(`/accounting/periods/${year}/${number}/close`);
export const reopenPeriod = (year: number, number: number, reason: string) => apiClient.post(`/accounting/periods/${year}/${number}/reopen`, { reason });

export type JournalKind = "SALES" | "PURCHASES" | "CASH" | "BANK" | "GENERAL" | "OPENING" | "CLOSING" | "PAYROLL";
export type TransactionType = "N" | "R" | "A" | "J";

export interface JournalDto {
  id: string;
  code: string;
  name: string;
  kind: JournalKind;
  system: boolean;
  isActive: boolean;
}

export interface EntryLineDto {
  lineNumber: number;
  account: { id: string; code: string; name: string };
  debit: string;
  credit: string;
  description: string;
  sourceDocumentId: string | null;
}

export interface EntryDto {
  id: string;
  journal: { id: string; code: string; name: string };
  year: number;
  period: number;
  number: number;
  docArchivalNumber: string;
  transactionId: string;
  transactionDate: string;
  postingDate: string;
  description: string;
  transactionType: TransactionType;
  origin: string;
  totalDebit: string;
  totalCredit: string;
  systemEntryDate: string;
  reverses: { id: string; transactionId: string } | null;
  reversedBy: { id: string; transactionId: string } | null;
  lines: EntryLineDto[];
}

export interface NewEntry {
  journalId: string;
  transactionDate: string;
  postingDate?: string;
  period?: number;
  description: string;
  transactionType?: TransactionType;
  lines: { accountId: string; debit?: number; credit?: number; description?: string }[];
}

export interface EntryFilters {
  year?: number;
  period?: number;
  journalId?: string;
  accountId?: string;
  search?: string;
  take?: number;
  skip?: number;
}

const query = (params: Record<string, string | number | undefined | null>) =>
  new URLSearchParams(Object.entries(params).filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== null && e[1] !== "").map(([k, v]) => [k, String(v)]));

export const fetchJournals = () => apiClient.get<JournalDto[]>("/accounting/journals");
export const fetchEntries = (f: EntryFilters) => apiClient.get<{ items: EntryDto[]; total: number }>(`/accounting/entries?${query({ ...f })}`);
export const createEntry = (body: NewEntry) => apiClient.post<EntryDto>("/accounting/entries", body);
export const reverseEntry = (id: string, body: { date?: string; description?: string }) => apiClient.post<EntryDto>(`/accounting/entries/${id}/reverse`, body);

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
