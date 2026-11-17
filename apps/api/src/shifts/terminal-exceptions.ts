import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Shift/till integrity. A shift opened on a till belongs to that till; a
 * browser shift (terminalId null) to no till. When a till's work lands in a
 * shift that isn't its own, it is either refused (online: nothing has
 * happened yet) or, for work that already happened offline (a sale with its
 * fiscal document, a cash count), recorded as it is and flagged here for a
 * manager. Nothing is moved, rewritten or recalculated.
 */
export const SHIFT_TERMINAL_MISMATCH = "SHIFT_TERMINAL_MISMATCH";

export type MismatchOperation = "sale" | "shift-open" | "cash-movement" | "shift-close";

/** The shift's till and the request's till differ (a browser shift counts as "no till"). */
export function tillMismatch(shiftTerminalId: string | null | undefined, requestTerminalId: string | null | undefined): boolean {
  return (shiftTerminalId ?? null) !== (requestTerminalId ?? null);
}

/**
 * Whether a sale's shift is somewhere else than the sale. With an
 * authenticated till (its key) the shift must be exactly that till's (a
 * browser shift isn't). Without one (a browser, or an older app that names a
 * till without a key) only a shift on a different named till counts, as before.
 */
export function shiftIsElsewhere(shiftTerminalId: string | null, saleTerminalId: string | null, authenticatedTill: boolean): boolean {
  if (authenticatedTill) return tillMismatch(shiftTerminalId, saleTerminalId);
  return !!shiftTerminalId && !!saleTerminalId && shiftTerminalId !== saleTerminalId;
}

export interface TerminalMismatch {
  businessId: string;
  userId: string;
  shiftId: string;
  operation: MismatchOperation;
  /** The till the work came from (its key), or null. */
  requestTerminalId: string | null;
  /** The till the shift belongs to, or null for a browser shift. */
  shiftTerminalId: string | null;
  /** The till id the app itself sent, when it differs from its key's. */
  sentTerminalId?: string | null;
  offline: boolean;
  /** The sale's or movement's own id, for finding it. */
  clientId?: string | null;
  saleId?: string | null;
}

type Db = Pick<PrismaClient, "auditLog"> | Prisma.TransactionClient;

/** An auditable exception on the shift, shown to managers on the Shifts page. */
export function recordTerminalMismatch(db: Db, m: TerminalMismatch) {
  return db.auditLog.create({
    data: {
      businessId: m.businessId,
      userId: m.userId,
      action: SHIFT_TERMINAL_MISMATCH,
      entityType: "shift",
      entityId: m.shiftId,
      metadata: {
        operation: m.operation,
        requestTerminalId: m.requestTerminalId,
        shiftTerminalId: m.shiftTerminalId,
        sentTerminalId: m.sentTerminalId ?? null,
        offline: m.offline,
        clientId: m.clientId ?? null,
        saleId: m.saleId ?? null,
      },
    },
  });
}
