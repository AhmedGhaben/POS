-- AlterTable
ALTER TABLE "fiscal_documents" ADD COLUMN     "chainVerified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "signedBy" TEXT NOT NULL DEFAULT 'SERVER';

-- CreateTable
CREATE TABLE "fiscal_chain_alerts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "terminalId" TEXT,
    "seriesId" TEXT,
    "documentId" TEXT,
    "kind" TEXT NOT NULL,
    "documentNo" TEXT,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "fiscal_chain_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_chain_alerts_businessId_resolvedAt_idx" ON "fiscal_chain_alerts"("businessId", "resolvedAt");

