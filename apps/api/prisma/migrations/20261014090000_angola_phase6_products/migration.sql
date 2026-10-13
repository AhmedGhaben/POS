-- CreateEnum
CREATE TYPE "SaftProductType" AS ENUM ('P', 'S', 'O', 'E', 'I');

-- CreateEnum
CREATE TYPE "CostingMethod" AS ENUM ('WEIGHTED_AVERAGE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'SALE', 'SALE_VOID', 'RETURN', 'PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "averageCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
ALTER COLUMN "quantity" SET DEFAULT 0,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "reorderLevel" SET DEFAULT 0,
ALTER COLUMN "reorderLevel" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "exemptionCode" TEXT,
ADD COLUMN     "inventoryType" TEXT,
ADD COLUMN     "photoId" TEXT,
ADD COLUMN     "productType" "SaftProductType" NOT NULL DEFAULT 'P',
ADD COLUMN     "taxCode" TEXT,
ADD COLUMN     "taxRateId" TEXT,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'un';

-- AlterTable
ALTER TABLE "purchase_line_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "return_line_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "sale_line_items" ADD COLUMN     "exemptionCode" TEXT,
ADD COLUMN     "taxCode" TEXT,
ADD COLUMN     "taxRate" DECIMAL(5,2),
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'un',
ADD COLUMN     "unitCost" DECIMAL(14,4),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_transfer_line_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "costingMethod" "CostingMethod" NOT NULL DEFAULT 'WEIGHTED_AVERAGE';

-- CreateTable
CREATE TABLE "product_photos" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "balance" DECIMAL(14,3) NOT NULL,
    "averageCost" DECIMAL(14,4) NOT NULL,
    "saleId" TEXT,
    "returnId" TEXT,
    "purchaseId" TEXT,
    "transferId" TEXT,
    "userId" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_photos_productId_key" ON "product_photos"("productId");

-- CreateIndex
CREATE INDEX "stock_movements_storeId_productId_occurredAt_idx" ON "stock_movements"("storeId", "productId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_storeId_occurredAt_idx" ON "stock_movements"("storeId", "occurredAt");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing data.
-- Services and other untracked items are SAF-T "S"; goods are merchandise ("M").
UPDATE "products" SET "productType" = 'S' WHERE "trackStock" = false;
UPDATE "products" SET "inventoryType" = 'M' WHERE "trackStock" = true;

-- Products pick their tax by name: link the business's rate with the same
-- percentage (rates the owner already has); 0% counts as exempt.
UPDATE "products" p SET "taxRateId" = r."id", "taxCode" = r."taxCode"
FROM "tax_rates" r
WHERE r."businessId" = p."businessId" AND r."active" AND r."taxType" = 'IVA' AND r."region" = 'AO'
  AND r."percentage" = p."taxRate" AND p."taxRate" > 0;
UPDATE "products" SET "taxCode" = 'NOR' WHERE "taxRate" > 0 AND "taxCode" IS NULL;
UPDATE "products" SET "taxCode" = 'ISE' WHERE "taxRate" = 0;

-- The stock already on the shelves: valued at the product's cost price, and
-- the first movement of each product's history (stock at earlier dates isn't known).
UPDATE "inventory_items" i SET "averageCost" = p."costPrice"
FROM "products" p WHERE p."id" = i."productId";
INSERT INTO "stock_movements" ("id", "storeId", "productId", "type", "quantity", "unitCost", "balance", "averageCost", "note")
SELECT gen_random_uuid()::text, i."storeId", i."productId", 'OPENING', i."quantity", i."averageCost", i."quantity", i."averageCost", 'Stock when stock history started'
FROM "inventory_items" i JOIN "products" p ON p."id" = i."productId"
WHERE p."trackStock" = true;
