import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

/** "ELE" + 28 → "ELE-028". */
export function formatSku(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

/** The highest number already used with this prefix in the business (any case), 0 if none. */
async function highestUsed(db: Db, businessId: string, prefix: string): Promise<number> {
  const pattern = `^${prefix}-([0-9]{1,9})$`;
  const [{ max }] = await db.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(substring(upper("sku") from ${pattern}) AS INTEGER)) AS "max"
    FROM "products" WHERE "businessId" = ${businessId}`;
  return max ?? 0;
}

/**
 * The SKU a new product in the category would get, without taking it
 * (shown pre-filled in the form). Null when the category has no prefix.
 */
export async function peekCategorySku(db: Db, businessId: string, categoryId: string): Promise<string | null> {
  const category = await db.category.findFirst({ where: { id: categoryId, businessId }, include: { skuCounter: true } });
  if (!category?.skuPrefix) return null;
  const used = await highestUsed(db, businessId, category.skuPrefix);
  return formatSku(category.skuPrefix, Math.max(used, category.skuCounter?.last ?? 0) + 1);
}

/**
 * Takes the category's next SKU (tester #40). Upsert-and-increment in one
 * statement: the row lock is held until the caller's transaction commits,
 * so two people adding products at once get consecutive numbers, never the
 * same one. Starts above any SKU already typed with the prefix.
 */
export async function takeCategorySku(tx: Db, businessId: string, categoryId: string): Promise<string | null> {
  const category = await tx.category.findFirst({ where: { id: categoryId, businessId }, select: { skuPrefix: true } });
  if (!category?.skuPrefix) return null;
  const used = await highestUsed(tx, businessId, category.skuPrefix);
  const [{ last }] = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "category_sku_counters" ("categoryId", "businessId", "last")
    VALUES (${categoryId}, ${businessId}, ${used + 1})
    ON CONFLICT ("categoryId") DO UPDATE SET "last" = GREATEST("category_sku_counters"."last" + 1, ${used + 1})
    RETURNING "last"`;
  return formatSku(category.skuPrefix, last);
}
