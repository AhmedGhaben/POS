import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FiscalNumberDto, TillSeriesDto } from "@pos/shared";
import { apiClient } from "@/lib/api-client";

/**
 * The till numbers and signs its own documents (docs/plans/ANGOLA.md,
 * decision 5 and phase 8): one series per till per document type per year
 * ("FR POS001-2026/57"), gap-free, each document signed over the previous
 * one's hash, so the receipt carries its number and hash characters even
 * offline. The server checks every number arrives in order and every
 * signature over the chain.
 *
 * A number (and its hash) is only used up once the sale is accepted or
 * queued; a sale the server refuses gives it back. A till that has never
 * read its series from the server doesn't number at all, so a reinstalled
 * till can't reuse numbers or break the chain.
 */
export interface LocalSeries {
  code: string;
  next: number;
  /** The hash of the last document in the series: the next one signs over it. */
  lastHash: string;
}

/** The number for the next document, and the hash it signs over. */
export interface NextNumber {
  series: string;
  number: number;
  previousHash: string;
}

interface NumberingState {
  terminalId: string | null;
  /** Read from the server at least once for this till. */
  synced: boolean;
  /** By document type. */
  series: Record<string, LocalSeries>;
  /** Merges the server's view (never goes backwards: queued sales may be ahead of it). */
  sync: (terminalId: string, server: TillSeriesDto) => void;
  /** The number used (sale accepted or queued), and the hash it got. */
  commit: (documentType: string, used: Pick<FiscalNumberDto, "series" | "number" | "hash">) => void;
  /** The server said where the series really is (a number was already used). */
  adopt: (documentType: string, code: string, next: number, lastHash: string) => void;
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
): NextNumber | null {
  if (!terminal || state.terminalId !== terminal.id || !state.synced) return null;
  const code = seriesCode(terminal.code, year);
  const local = state.series[documentType];
  return local?.code === code ? { series: code, number: local.next, previousHash: local.lastHash } : { series: code, number: 1, previousHash: "" };
}

/**
 * The local series after reading the server's: whichever is further ahead.
 * When the server is ahead (it numbered some itself), its next number and
 * last hash are the ones to carry on from.
 */
export function mergeSeries(
  local: Record<string, LocalSeries>,
  server: Pick<TillSeriesDto, "series">,
  year: number,
): Record<string, LocalSeries> {
  const merged = { ...local };
  for (const s of server.series) {
    if (s.year !== year) continue;
    const mine = merged[s.documentType];
    const serverSide = { code: s.code, next: s.nextNumber, lastHash: s.lastHash ?? "" };
    merged[s.documentType] = mine?.code === s.code && mine.next >= s.nextNumber ? mine : serverSide;
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
        if (current?.code === used.series && current.next > used.number) return;
        set({ series: { ...get().series, [documentType]: { code: used.series, next: used.number + 1, lastHash: used.hash ?? "" } } });
      },
      adopt: (documentType, code, next, lastHash) => set({ series: { ...get().series, [documentType]: { code, next, lastHash } } }),
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
