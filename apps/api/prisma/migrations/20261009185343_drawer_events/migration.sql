-- CreateEnum
CREATE TYPE "DrawerOpenReason" AS ENUM ('SALE_CASH_PAYMENT', 'MANUAL_OPEN');

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'OPEN_DRAWER';

-- CreateTable
CREATE TABLE "drawer_events" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "terminalId" TEXT,
    "userId" TEXT NOT NULL,
    "reason" "DrawerOpenReason" NOT NULL,
    "subReason" TEXT,
    "note" TEXT,
    "saleClientId" TEXT,
    "saleId" TEXT,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "permitted" BOOLEAN NOT NULL DEFAULT true,
    "createdOffline" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawer_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drawer_events_businessId_occurredAt_idx" ON "drawer_events"("businessId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "drawer_events_storeId_clientId_key" ON "drawer_events"("storeId", "clientId");

-- AddForeignKey
ALTER TABLE "drawer_events" ADD CONSTRAINT "drawer_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawer_events" ADD CONSTRAINT "drawer_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawer_events" ADD CONSTRAINT "drawer_events_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawer_events" ADD CONSTRAINT "drawer_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

