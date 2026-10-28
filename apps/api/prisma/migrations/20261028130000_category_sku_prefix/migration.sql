-- SKU suggested from the category (tester #40): an optional prefix per
-- category and the last number handed out for it. Existing SKUs don't change.
ALTER TABLE "categories" ADD COLUMN "skuPrefix" TEXT;
CREATE UNIQUE INDEX "categories_businessId_skuPrefix_key" ON "categories"("businessId", "skuPrefix");

CREATE TABLE "category_sku_counters" (
    "categoryId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "category_sku_counters_pkey" PRIMARY KEY ("categoryId")
);
ALTER TABLE "category_sku_counters" ADD CONSTRAINT "category_sku_counters_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
