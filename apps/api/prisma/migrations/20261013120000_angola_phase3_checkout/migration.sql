-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'DISCOUNT_ABOVE_LIMIT';
ALTER TYPE "Permission" ADD VALUE 'CHANGE_PRICE';
ALTER TYPE "Permission" ADD VALUE 'SELL_ON_CREDIT';
ALTER TYPE "Permission" ADD VALUE 'CASH_OUT';

-- AlterTable
ALTER TABLE "businesses" DROP COLUMN "shiftsEnabled",
ADD COLUMN     "shiftDifferenceThreshold" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN     "approvedById" TEXT;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "isFinalConsumer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "trackStock" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "sale_line_items" ADD COLUMN     "originalUnitPrice" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "countedDenominations" JSONB,
ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "forcedClose" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "manager_overrides" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "permission" "Permission" NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manager_overrides_tokenHash_key" ON "manager_overrides"("tokenHash");

-- CreateIndex
CREATE INDEX "manager_overrides_businessId_createdAt_idx" ON "manager_overrides"("businessId", "createdAt");


-- One "Consumidor Final" (NIF 999999999) per business, used when a sale has no customer.
CREATE UNIQUE INDEX "customers_one_final_consumer_per_business" ON "customers"("businessId") WHERE "isFinalConsumer";

INSERT INTO "customers" ("id", "businessId", "name", "taxId", "isFinalConsumer", "createdAt")
SELECT 'fc_' || md5(b."id" || clock_timestamp()::text), b."id", 'Consumidor Final', '999999999', true, CURRENT_TIMESTAMP
FROM "businesses" b
WHERE NOT EXISTS (SELECT 1 FROM "customers" c WHERE c."businessId" = b."id" AND c."isFinalConsumer");
