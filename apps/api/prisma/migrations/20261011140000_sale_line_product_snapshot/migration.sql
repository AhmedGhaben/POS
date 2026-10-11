-- Sale lines keep the product's name and SKU as sold. Existing lines take
-- the product's current values (the best record there is).
ALTER TABLE "sale_line_items" ADD COLUMN "productName" TEXT;
ALTER TABLE "sale_line_items" ADD COLUMN "productSku" TEXT;

UPDATE "sale_line_items" AS sli
SET "productName" = p."name", "productSku" = p."sku"
FROM "products" AS p
WHERE p."id" = sli."productId";

ALTER TABLE "sale_line_items" ALTER COLUMN "productName" SET NOT NULL;
ALTER TABLE "sale_line_items" ALTER COLUMN "productSku" SET NOT NULL;
