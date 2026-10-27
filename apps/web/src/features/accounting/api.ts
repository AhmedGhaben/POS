import { apiClient } from "@/lib/api-client";
import type { BusinessDto, FiscalDocumentDto, StoreDto, UserDto } from "@pos/shared";

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
  /** The purchases file's due day; null = the country's (the month's last day in Angola). */
  purchasesFileDueDay: number | null;
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
/** Under ACCOUNTING_KEY, so whatever changes a company's books (switching accounting on, posting, closing a period) refreshes the accountant's list too. */
export const ACCOUNTANT_CLIENTS_KEY = [...ACCOUNTING_KEY, "clients"] as const;
export const YEARS_KEY = [...ACCOUNTING_KEY, "years"] as const;
export const JOURNALS_KEY = [...ACCOUNTING_KEY, "journals"] as const;
export const ENTRIES_KEY = [...ACCOUNTING_KEY, "entries"] as const;
export const INTEGRATION_KEY = [...ACCOUNTING_KEY, "integration"] as const;
export const MAPPING_KEY = [...ACCOUNTING_KEY, "mapping"] as const;
export const TEMPLATES_KEY = [...ACCOUNTING_KEY, "templates"] as const;

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
export const workOutResults = (year: number) => apiClient.post<{ entries: string[] }>(`/accounting/years/${year}/results`);
export const closeYear = (year: number) => apiClient.post(`/accounting/years/${year}/close`);
export const reopenYear = (year: number, reason: string) => apiClient.post(`/accounting/years/${year}/reopen`, { reason });

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

export type SourceType =
  | "FISCAL_DOCUMENT"
  | "FISCAL_DOCUMENT_ANNULMENT"
  | "PURCHASE"
  | "SUPPLIER_PAYMENT"
  | "SUPPLIER_PAYMENT_CANCEL"
  | "EXPENSE"
  | "EXPENSE_CANCEL"
  | "SHIFT_DIFFERENCE"
  | "CASH_MOVEMENT"
  | "STOCK_ADJUSTMENT";

export interface IntegrationDto {
  pending: Record<SourceType, number>;
  pendingTotal: number;
  postedTotal: number;
  lastPostedAt: string | null;
  running: boolean;
  errors: { sourceType: SourceType; sourceId: string; documentNo: string | null; documentDate: string; message: string; attempts: number; lastTriedAt: string }[];
}

export type MappingGroup = "sales" | "iva" | "payments" | "stock" | "cash" | "expenses";

export interface MappingDto {
  key: string;
  group: MappingGroup;
  defaultCode: string | null;
  account: { id: string; code: string; name: string } | null;
  custom: boolean;
}

export const fetchIntegration = () => apiClient.get<IntegrationDto>("/accounting/integration");
export const runIntegration = () => apiClient.post<{ posted: number; skipped: number; failed: number }>("/accounting/integration/run");
export const fetchMapping = () => apiClient.get<MappingDto[]>("/accounting/mapping");
export const setMapping = (key: string, accountId: string | null) => apiClient.put(`/accounting/mapping/${encodeURIComponent(key)}`, { accountId });

export interface EntryTemplateDto {
  id: string;
  name: string;
  journalId: string;
  description: string;
  transactionType: TransactionType;
  lines: { accountId: string; side: "D" | "C"; amount: number | null; description: string | null }[];
}

export type NewTemplate = Omit<EntryTemplateDto, "id">;

export const fetchTemplates = () => apiClient.get<EntryTemplateDto[]>("/accounting/templates");
export const createTemplate = (body: NewTemplate) => apiClient.post<EntryTemplateDto>("/accounting/templates", body);
export const removeTemplate = (id: string) => apiClient.delete(`/accounting/templates/${id}`);
export const postOpening = (year: number, lines: { accountId: string; debit: number; credit: number }[]) => apiClient.post<EntryDto>("/accounting/opening", { year, lines });

export type AccountingReportKey = "trialBalance" | "ledger" | "journal" | "statement" | "ageing" | "balanceSheet" | "incomeStatement" | "vat";
export type ReportCell = string | number | null;

export interface ReportTableDto {
  title?: string;
  columns: { key: string; kind: "text" | "code" | "label" | "money" | "date" | "count" | "percent" }[];
  rows: Record<string, ReportCell>[];
  totals: Record<string, ReportCell> | null;
}

export interface ReportParams {
  report: AccountingReportKey;
  year: number;
  fromPeriod: number;
  toPeriod: number;
  level?: number;
  accountId?: string;
  journalId?: string;
  party?: "customer" | "supplier";
  partyId?: string;
}

export interface ReportResultDto {
  report: AccountingReportKey;
  year: number;
  fromPeriod: number;
  toPeriod: number;
  company: { name: string; taxId: string | null };
  /** Their name and OCPCA number go on the statements. */
  accountant: { name: string; ocpcaNumber: string | null } | null;
  tables: ReportTableDto[];
}

export const fetchReport = ({ report, ...p }: ReportParams) => apiClient.get<ReportResultDto>(`/accounting/reports/${report}?${query({ ...p })}`);

export type SaftIssueCode = "noTaxId" | "notKwanza" | "noYear" | "unposted" | "unbalanced" | "openPeriods" | "resultsNotWorkedOut" | "movementAccountWithSubAccounts";

export interface SaftCheckDto {
  year: number;
  ready: boolean;
  issues: { code: SaftIssueCode; blocking: boolean; detail?: string }[];
}

export const checkSaft = (year: number, draft: boolean) => apiClient.get<SaftCheckDto>(`/accounting/saft/check?year=${year}${draft ? "&draft=true" : ""}`);

/** A company the accountant works for, or one that invited them and waits for an answer. */
export type AccountantClientDto =
  | {
      invitation: "ACCEPTED";
      businessId: string;
      name: string;
      taxId: string | null;
      country: string;
      current: boolean;
      accountingEnabled: boolean;
      pending: number;
      errors: number;
      openMonths: number;
      lastYearSaftMade: boolean;
    }
  | {
      invitation: "PENDING";
      businessId: string;
      name: string;
      taxId: string | null;
      country: string;
      invitedAt: string;
      invitedBy: string | null;
    };

export interface AccountantDto {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  ocpcaNumber: string | null;
  since: string;
  /** Invited, not accepted yet (an accountant who already had a login). */
  pending: boolean;
}

export const fetchClients = () => apiClient.get<AccountantClientDto[]>("/accountant/clients");
export const switchBusiness = (businessId: string) =>
  apiClient.post<{ accessToken: string; user: UserDto; stores: StoreDto[]; business: BusinessDto }>("/auth/switch-business", { businessId });
export const acceptInvitation = (businessId: string) => apiClient.post<{ accepted: true }>(`/accountant/invitations/${businessId}/accept`);
export const declineInvitation = (businessId: string) => apiClient.post<{ declined: true }>(`/accountant/invitations/${businessId}/decline`);
/** The invitation email's link: works signed out. */
export const acceptInvitationLink = (token: string) =>
  apiClient.post<{ accepted: true; email: string; businessName: string }>("/accountant/invitations/accept-link", { token }, { skipAuth: true });
export const saveProfile = (ocpcaNumber: string | null) => apiClient.patch<{ ocpcaNumber: string | null }>("/accountant/profile", { ocpcaNumber });
export const fetchAccountants = () => apiClient.get<AccountantDto[]>("/accounting/accountants");
export const inviteAccountant = (body: { email: string; firstName: string; lastName: string; ocpcaNumber?: string }) =>
  apiClient.post<{ userId: string; email: string; newLogin: boolean; pending: boolean }>("/accounting/accountants", body);
export const revokeAccountant = (userId: string) => apiClient.delete(`/accounting/accountants/${userId}`);

/** A page of the period's documents for the archive, each with its path in the ZIP. */
export interface ArchiveDocumentsPage {
  total: number;
  documents: { path: string; document: FiscalDocumentDto }[];
  next: number | null;
}

export const fetchArchiveDocuments = (startDate: string, endDate: string, offset: number) =>
  apiClient.get<ArchiveDocumentsPage>(`/accounting/archive/documents?startDate=${startDate}&endDate=${endDate}&offset=${offset}`);

export type AttachmentOwner = "PURCHASE" | "EXPENSE" | "ENTRY";

export interface AttachmentDto {
  id: string;
  ownerType: AttachmentOwner;
  ownerId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export const fetchAttachments = (ownerType: AttachmentOwner, ownerId: string) => apiClient.get<AttachmentDto[]>(`/attachments?ownerType=${ownerType}&ownerId=${encodeURIComponent(ownerId)}`);
export const uploadAttachment = (body: { ownerType: AttachmentOwner; ownerId: string; fileName: string; dataUrl: string }) => apiClient.post<AttachmentDto>("/attachments", body);
export const removeAttachment = (id: string) => apiClient.delete(`/attachments/${id}`);

export interface BankMapping {
  date: number;
  description: number;
  amount?: number;
  debit?: number;
  credit?: number;
  reference?: number;
  skipRows?: number;
}

export interface BankStatementSummaryDto {
  id: string;
  fileName: string;
  periodFrom: string;
  periodTo: string;
  createdAt: string;
  _count: { lines: number };
}

export interface BankStatementDto {
  id: string;
  account: { id: string; code: string; name: string };
  fileName: string;
  periodFrom: string;
  periodTo: string;
  totals: { statement: string; matched: string; open: string };
  lines: { id: string; date: string; description: string; reference: string | null; amount: string; matchKind: "AUTO" | "MANUAL" | "POSTED" | null; matched: { lineId: string; transactionId: string; date: string } | null }[];
  unexplained: { lineId: string; date: string; transactionId: string; description: string; amount: string }[];
}

export const parseStatement = (fileName: string, dataUrl: string) => apiClient.post<{ rows: string[][] }>("/accounting/bank/parse", { fileName, dataUrl });
export const importStatement = (body: { accountId: string; fileName: string; rows: string[][]; mapping: BankMapping }) =>
  apiClient.post<{ id: string; lines: number; matched: number; skippedRows: number[] }>("/accounting/bank/statements", body);
export const fetchStatements = () => apiClient.get<BankStatementSummaryDto[]>("/accounting/bank/statements");
export const fetchStatement = (id: string) => apiClient.get<BankStatementDto>(`/accounting/bank/statements/${id}`);
export const autoMatchStatement = (id: string) => apiClient.post<{ matched: number }>(`/accounting/bank/statements/${id}/auto-match`);
export const matchBankLine = (lineId: string, ledgerLineId: string) => apiClient.post(`/accounting/bank/lines/${lineId}/match`, { ledgerLineId });
export const unmatchBankLine = (lineId: string) => apiClient.post(`/accounting/bank/lines/${lineId}/unmatch`);
export const postBankLine = (lineId: string, accountId: string) => apiClient.post<{ entryId: string; transactionId: string }>(`/accounting/bank/lines/${lineId}/post`, { accountId });

export interface FixedAssetDto {
  id: string;
  code: string;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionValue: string;
  residualValue: string;
  annualRate: string;
  depreciated: string;
  netBookValue: string;
  status: "ACTIVE" | "DISPOSED";
  disposalDate: string | null;
  disposalValue: string | null;
}

export interface AssetCategoryDto {
  key: string;
  name: string;
  maxRate: number;
  asset: string;
  accumulated: string;
  expense: string;
}

export const fetchAssets = () => apiClient.get<FixedAssetDto[]>("/accounting/assets");
export const fetchAssetCategories = () => apiClient.get<AssetCategoryDto[]>("/accounting/assets/categories");
export const createAsset = (body: { name: string; category: string; acquisitionDate: string; acquisitionValue: number; residualValue?: number; annualRate?: number; counterAccountId?: string }) =>
  apiClient.post<FixedAssetDto>("/accounting/assets", body);
export const depreciateAssets = (year: number, month: number) => apiClient.post<{ assets: number; total: string; entryId: string | null }>("/accounting/assets/depreciate", { year, month });
export const disposeAsset = (id: string, body: { date: string; saleValue?: number; counterAccountId?: string }) =>
  apiClient.post<{ entryId: string; transactionId: string; bookValue: string; result: string }>(`/accounting/assets/${id}/dispose`, body);

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
