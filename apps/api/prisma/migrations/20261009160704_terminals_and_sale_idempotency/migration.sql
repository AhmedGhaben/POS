-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "createdOffline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "terminalId" TEXT;

-- CreateTable
CREATE TABLE "terminals" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terminals_storeId_idx" ON "terminals"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "terminals_businessId_sequence_key" ON "terminals"("businessId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "sales_storeId_clientId_key" ON "sales"("storeId", "clientId");

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

