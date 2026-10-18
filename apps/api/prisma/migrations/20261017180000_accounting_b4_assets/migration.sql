-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "assetAccountId" TEXT NOT NULL,
    "accumulatedAccountId" TEXT NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "acquisitionDate" DATE NOT NULL,
    "acquisitionValue" DECIMAL(16,2) NOT NULL,
    "residualValue" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "annualRate" DECIMAL(5,2) NOT NULL,
    "depreciationStart" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "acquisitionEntryId" TEXT,
    "disposalDate" DATE,
    "disposalValue" DECIMAL(16,2),
    "disposalEntryId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_depreciations" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "entryId" TEXT NOT NULL,

    CONSTRAINT "asset_depreciations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_businessId_code_key" ON "fixed_assets"("businessId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "asset_depreciations_assetId_year_month_key" ON "asset_depreciations"("assetId", "year", "month");

-- AddForeignKey
ALTER TABLE "asset_depreciations" ADD CONSTRAINT "asset_depreciations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
