-- CreateTable
CREATE TABLE "entry_templates" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL DEFAULT 'N',
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entry_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entry_templates_businessId_idx" ON "entry_templates"("businessId");
