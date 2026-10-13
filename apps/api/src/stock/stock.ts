import { BadRequestException } from "@nestjs/common";
import { Prisma, StockMovementType } from "@prisma/client";
import { applyMovement } from "./costing";

type Num = Prisma.Decimal | number | string;

export interface MovementInput {
  storeId: string;
  product: { id: string; name: string; costPrice: Num };
  type: StockMovementType;
  /** Positive in, negative out. */
  quantity: Num;
  /** Cost per unit of stock coming in with a cost (purchases, transfers in); otherwise the average. */
  unitCost?: Num | null;
  /** Refuse to take the stock below zero ("Insufficient stock for ..."). */
  requireStock?: boolean;
  /** Message when there isn't enough stock (defaults to the till's). */
  insufficientMessage?: string;
  saleId?: string;
  returnId?: string;
  purchaseId?: string;
  transferId?: string;
  userId?: string;
  note?: string;
  /** When it happened (an offline sale's time); now by default. */
  occurredAt?: Date;
}

/**
 * Changes a store's stock of one product inside the caller's transaction:
 * locks its row, moves the quantity, re-averages the cost and writes the
 * movement. Every stock change goes through here, so the history adds up
 * to the stock.
 */
export async function recordMovement(tx: Prisma.TransactionClient, input: MovementInput) {
  const where = { storeId_productId: { storeId: input.storeId, productId: input.product.id } };
  // The no-op update takes the row lock until the transaction ends, so two
  // tills selling the same product queue up instead of overwriting each other.
  const item = await tx.inventoryItem.upsert({
    where,
    create: { storeId: input.storeId, productId: input.product.id, quantity: 0, averageCost: 0 },
    update: { quantity: { increment: 0 } },
  });
  const moved = applyMovement(item, input.quantity, input.unitCost, input.product.costPrice);
  if (input.requireStock && moved.quantity.lt(0)) {
    throw new BadRequestException(input.insufficientMessage ?? `Insufficient stock for "${input.product.name}"`);
  }
  await tx.inventoryItem.update({ where, data: { quantity: moved.quantity, averageCost: moved.averageCost } });
  return tx.stockMovement.create({
    data: {
      storeId: input.storeId,
      productId: input.product.id,
      type: input.type,
      quantity: new Prisma.Decimal(input.quantity),
      unitCost: moved.unitCost,
      balance: moved.quantity,
      averageCost: moved.averageCost,
      saleId: input.saleId,
      returnId: input.returnId,
      purchaseId: input.purchaseId,
      transferId: input.transferId,
      userId: input.userId,
      note: input.note,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    },
  });
}
