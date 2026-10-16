import { apiClient } from "@/lib/api-client";

/** The back-office reports (docs/plans/ANGOLA.md, phase 10); the API's report-tables.ts. */
export const REPORT_GROUPS = [
  { group: "sales", reports: ["salesByDay", "salesByMonth", "salesByProduct", "salesByCategory", "salesByCashier", "salesByPayment", "salesByDocumentType"] },
  { group: "tax", reports: ["ivaSummary", "agtStatus"] },
  { group: "stock", reports: ["stockValuation", "lowStock"] },
  { group: "accounts", reports: ["customerBalances", "supplierBalances", "purchases"] },
] as const;
export type ReportKey = (typeof REPORT_GROUPS)[number]["reports"][number];

/** Stock and balances as they are now: no period. */
export const SNAPSHOT_REPORTS: ReportKey[] = ["stockValuation", "lowStock", "customerBalances", "supplierBalances"];

export type ColumnKind = "text" | "date" | "month" | "money" | "quantity" | "count" | "percent" | "method" | "docType" | "agtStatus";
export type Cell = string | number | null;

export interface ReportTableDto {
  title?: string;
  columns: { key: string; kind: ColumnKind }[];
  rows: Record<string, Cell>[];
  totals: Record<string, Cell> | null;
}

export interface ReportResultDto {
  report: ReportKey;
  startDate: string | null;
  endDate: string | null;
  storeId: string | null;
  tables: ReportTableDto[];
}

export function fetchReport(report: ReportKey, params: { storeId: string | null; startDate?: string; endDate?: string }) {
  const query = new URLSearchParams(
    Object.entries({ storeId: params.storeId, startDate: params.startDate, endDate: params.endDate }).filter((e): e is [string, string] => !!e[1]),
  );
  return apiClient.get<ReportResultDto>(`/reports/tables/${report}?${query}`);
}
