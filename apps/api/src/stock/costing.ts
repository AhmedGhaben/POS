import { Prisma } from "@prisma/client";

type Num = Prisma.Decimal | number | string;
const D = (n: Num) => new Prisma.Decimal(n);

export interface StockPosition {
  quantity: Num;
  averageCost: Num;
}

export interface CostedMovement {
  /** Stock and average cost after the movement. */
  quantity: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  /** What one unit of this movement is valued at. */
  unitCost: Prisma.Decimal;
}

/**
 * Weighted average cost (docs/plans/ANGOLA.md, additions decision 3).
 *
 * - Stock coming in with a cost (a purchase, a transfer in at the sending
 *   store's average, the opening stock) re-averages:
 *   (old qty x old average + qty x cost) / (old qty + qty).
 * - Stock coming in without one (a return, a cancelled sale, a count that
 *   found more) comes back at the current average, which doesn't change it.
 * - Stock going out leaves at the current average, which doesn't change it.
 * - With no stock (or less than none), the average restarts at the new cost.
 *
 * `fallbackCost` (the product's cost price) values stock that has no average yet.
 */
export function applyMovement(position: StockPosition, quantity: Num, unitCost: Num | null | undefined, fallbackCost: Num): CostedMovement {
  const oldQty = D(position.quantity);
  const oldAvg = D(position.averageCost);
  const qty = D(quantity);
  const current = oldAvg.gt(0) ? oldAvg : D(fallbackCost);
  const newQty = oldQty.add(qty);

  if (qty.lte(0)) {
    return { quantity: newQty, averageCost: current.toDecimalPlaces(4), unitCost: current.toDecimalPlaces(4) };
  }
  const cost = unitCost !== null && unitCost !== undefined ? D(unitCost) : current;
  const averageCost = oldQty.lte(0) ? cost : oldQty.mul(current).add(qty.mul(cost)).div(newQty);
  return { quantity: newQty, averageCost: averageCost.toDecimalPlaces(4), unitCost: cost.toDecimalPlaces(4) };
}
