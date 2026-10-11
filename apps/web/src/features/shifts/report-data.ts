import type { ShiftDto } from "@pos/shared";
import { localSummary, type LocalShift } from "./ledger";
import type { ShiftReportData } from "./components/ShiftReport";

const name = (p: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : null);

export function reportFromServer(shift: ShiftDto): ShiftReportData {
  const summary = shift.summary!;
  return {
    terminal: shift.terminal,
    openedBy: name(shift.openedBy)!,
    openedAt: shift.openedAt,
    closedBy: name(shift.closedBy),
    closedAt: shift.closedAt,
    openingFloat: Number(shift.openingFloat),
    countedCash: shift.countedCash != null ? Number(shift.countedCash) : null,
    expectedCash: Number(shift.expectedCash ?? summary.expectedCash),
    tillExpectedCash: shift.tillExpectedCash != null ? Number(shift.tillExpectedCash) : null,
    note: shift.note,
    summary,
  };
}

/** From the till's own record, for a shift closed while offline. */
export function reportFromLocal(
  shift: LocalShift,
  close?: { countedCash: number; closedAt: string; closedBy: string; note?: string },
): ShiftReportData {
  const summary = localSummary(shift);
  return {
    openedBy: shift.openedBy.name,
    openedAt: shift.openedAt,
    closedBy: close?.closedBy ?? null,
    closedAt: close?.closedAt ?? null,
    openingFloat: shift.openingFloat,
    countedCash: close?.countedCash ?? null,
    expectedCash: Number(summary.expectedCash),
    note: close?.note ?? null,
    summary,
  };
}
