/**
 * How the AGT queue waits and reads answers (docs/plans/ANGOLA.md, phase 9).
 * Pure, so the timings and the reading of obterEstado are tested alone.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Sending failed (network, 5xx, timeout): 30 s, 1 min, 2 min... at most an hour. */
export function retryDelay(attempt: number): number {
  return Math.min(30 * SECOND * 2 ** Math.max(attempt - 1, 0), 60 * MINUTE);
}

/** Too many requests (HTTP 429, E98): back off hard. */
export const THROTTLED_DELAY = 5 * MINUTE;

/** Asking for a result: first after 30 s, then a little longer each time, at most 10 min. */
export function pollDelay(polls: number): number {
  return Math.min(30 * SECOND * Math.max(polls, 1), 10 * MINUTE);
}

export type DocumentOutcome = { documentNo: string; valid: boolean; errors: { code: string; description: string }[] };

export type StatusReading =
  /** Still being processed, or asked too soon (8, 7; HTTP 422 E96/E97): ask again later. */
  | { kind: "wait" }
  /** AGT cancelled processing (9): send the documents again. */
  | { kind: "resend" }
  | { kind: "done"; documents: DocumentOutcome[] };

/** Reads an obterEstado answer. */
export function readStatus(body: {
  resultCode?: number | string;
  documentStatusList?: { documentNo: string; documentStatus: string; errorList?: { errorCode: string; errorDescription: string }[] }[];
}): StatusReading {
  const code = Number(body.resultCode);
  if (code === 7 || code === 8) return { kind: "wait" };
  if (code === 9) return { kind: "resend" };
  if (![0, 1, 2].includes(code)) return { kind: "wait" };
  return {
    kind: "done",
    documents: (body.documentStatusList ?? []).map((d) => ({
      documentNo: d.documentNo,
      valid: d.documentStatus === "V",
      errors: (d.errorList ?? []).map((e) => ({ code: e.errorCode, description: e.errorDescription })),
    })),
  };
}
