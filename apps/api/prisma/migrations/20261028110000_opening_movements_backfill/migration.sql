-- Stock with no movement behind it (written straight into inventory_items,
-- e.g. by the old demo seed) gets its opening movement, so the history adds
-- up to the stock and a product with stock can't be deleted (tester #36).
INSERT INTO "stock_movements" ("id", "storeId", "productId", "type", "quantity", "unitCost", "balance", "averageCost", "note")
SELECT gen_random_uuid()::text, i."storeId", i."productId", 'OPENING', i."quantity", i."averageCost", i."quantity", i."averageCost", 'Stock when stock history started'
FROM "inventory_items" i JOIN "products" p ON p."id" = i."productId"
WHERE p."trackStock" = true
  AND i."quantity" <> 0
  AND NOT EXISTS (SELECT 1 FROM "stock_movements" m WHERE m."storeId" = i."storeId" AND m."productId" = i."productId");
