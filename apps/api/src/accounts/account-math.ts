import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/**
 * Customer and supplier accounts (docs/plans/ANGOLA.md, phase 4): what is
 * still owed on each invoice or purchase, and how a payment is set against
 * them. Pure, so the rules are tested on their own.
 */

type Money = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);

/** Something that can still be owed: an invoice (FT) or a purchase. */
export interface OpenItem {
  id: string;
  /** Sorts oldest first: the document date, then its number. */
  sortKey: string;
  open: Money;
}

export interface Allocation {
  id: string;
  amount: Money;
}

/** What is still owed: the total less what was paid and what credit notes took off; never below zero. */
export function openAmount(total: Money, paid: Money, credited: Money = ZERO): Money {
  const open = total.sub(paid).sub(credited);
  return open.lt(0) ? ZERO : open;
}

export function totalOpen(items: OpenItem[]): Money {
  return items.reduce((s, i) => s.add(i.open), ZERO);
}

/**
 * Sets a payment against what is owed, oldest first. A payment can't be
 * more than everything owed (there's no money on account yet).
 */
export function allocateOldestFirst(items: OpenItem[], amount: Money): Allocation[] {
  if (amount.gt(totalOpen(items))) throw new BadRequestException("The payment is more than what is owed");
  const out: Allocation[] = [];
  let left = amount;
  for (const item of [...items].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))) {
    if (left.lte(0)) break;
    if (item.open.lte(0)) continue;
    const take = Prisma.Decimal.min(left, item.open);
    out.push({ id: item.id, amount: take });
    left = left.sub(take);
  }
  return out;
}

/** Allocations someone chose: each to an open item, within what it owes, adding up to the payment. */
export function checkAllocations(items: OpenItem[], requested: Allocation[], amount: Money): Allocation[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  let sum = ZERO;
  for (const a of requested) {
    const item = byId.get(a.id);
    if (!item || seen.has(a.id)) throw new BadRequestException("A payment can only go to this account's open documents, once each");
    if (a.amount.lte(0) || a.amount.gt(item.open)) throw new BadRequestException("An allocation is more than what is still owed on that document");
    seen.add(a.id);
    sum = sum.add(a.amount);
  }
  if (!sum.equals(amount)) throw new BadRequestException("The allocations must add up to the payment");
  return requested.filter((a) => a.amount.gt(0));
}

/** UNPAID, PARTIAL or PAID for a purchase. */
export function paymentStatus(total: Money, paid: Money): "UNPAID" | "PARTIAL" | "PAID" {
  if (paid.lte(0)) return total.lte(0) ? "PAID" : "UNPAID";
  return paid.gte(total) ? "PAID" : "PARTIAL";
}

/** What the customer may still buy on credit: limit less balance; null when they have no credit. */
export function availableCredit(limit: Money | null, balance: Money): Money | null {
  if (limit === null) return null;
  const left = limit.sub(balance);
  return left.lt(0) ? ZERO : left;
}
