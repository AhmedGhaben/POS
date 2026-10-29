-- A whole stock count saved at once (tester #41): its adjustments point at it.
CREATE TABLE "stock_counts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_counts_storeId_createdAt_idx" ON "stock_counts"("storeId", "createdAt");

ALTER TABLE "stock_movements" ADD COLUMN "stockCountId" TEXT;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "stock_counts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
