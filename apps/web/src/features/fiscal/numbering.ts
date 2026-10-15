import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FiscalNumberDto, TillSeriesDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

/**
 * The till numbers its own documents (docs/plans/ANGOLA.md, decision 5):
 * one series per till per document type per year ("FR POS001-2026/57"),
 * gap-free, so a receipt printed offline already carries its real number.
 * The server checks every number arrives in order and signs the chain.
 *
 * A number is only used up once the sale is accepted or queued; a sale the
 * server refuses gives its number back. A till that has never read its
 * series from the server doesn't number at all (the server numbers on
 * upload), so a reinstalled till can't reuse numbers.
 */
export interface LocalSeries {
  code: string;
  next: number;
}

interface NumberingState {
  terminalId: string | null;
  /** Read from the server at least once for this till. */
  synced: boolean;
  /** By document type. */
  series: Record<string, LocalSeries>;
  /** Merges the server's view (never goes backwards: queued sales may be ahead of it). */
  sync: (terminalId: string, server: TillSeriesDto) => void;
  /** The number used (sale accepted or queued). */
  commit: (documentType: string, used: FiscalNumberDto) => void;
  /** The server said where the series really is (a number was already used). */
  adopt: (documentType: string, code: string, next: number) => void;
}

/** The series code for a till and year: POS-001 in 2026 is "POS001-2026". */
export function seriesCode(terminalCode: string, year: number): string {
  return `${terminalCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}-${year}`;
}

/** The next number for a document, or null when the till shouldn't number it. */
export function peekNumber(
  state: Pick<NumberingState, "terminalId" | "synced" | "series">,
  terminal: { id: string; code: string } | null | undefined,
  documentType: string,
  year: number,
): FiscalNumberDto | null {
  if (!terminal || state.terminalId !== terminal.id || !state.synced) return null;
  const code = seriesCode(terminal.code, year);
  const local = state.series[documentType];
  return { series: code, number: local?.code === code ? local.next : 1 };
}

/** The local series after reading the server's: the further ahead of the two, per type. */
export function mergeSeries(local: Record<string, LocalSeries>, server: TillSeriesDto, year: number): Record<string, LocalSeries> {
  const merged = { ...local };
  for (const s of server.series) {
    if (s.year !== year) continue;
    const mine = merged[s.documentType];
    merged[s.documentType] = mine?.code === s.code ? { code: s.code, next: Math.max(mine.next, s.nextNumber) } : { code: s.code, next: s.nextNumber };
  }
  return merged;
}

export const useFiscalNumbering = create<NumberingState>()(
  persist(
    (set, get) => ({
      terminalId: null,
      synced: false,
      series: {},
      sync: (terminalId, server) => {
        const year = new Date().getFullYear();
        const local = get().terminalId === terminalId ? get().series : {};
        set({ terminalId, synced: true, series: mergeSeries(local, server, year) });
      },
      commit: (documentType, used) => {
        const current = get().series[documentType];
        const next = current?.code === used.series ? Math.max(current.next, used.number + 1) : used.number + 1;
        set({ series: { ...get().series, [documentType]: { code: used.series, next } } });
      },
      adopt: (documentType, code, next) => set({ series: { ...get().series, [documentType]: { code, next } } }),
    }),
    { name: "pos-fiscal-numbering" },
  ),
);

/** Reads where this till's series are on the server (call when online, e.g. opening the till). */
export async function syncTillSeries(terminal: { id: string } | null | undefined): Promise<void> {
  if (!terminal) return;
  const server = await apiClient.get<TillSeriesDto>(`/fiscal-documents/series/till/${terminal.id}`);
  useFiscalNumbering.getState().sync(terminal.id, server);
}
