-- docs/plans/ANGOLA.md, phase 9: the queue of fiscal documents sent to AGT
-- (e-invoicing, behind AGT_EINVOICE_ENABLED).

-- CreateEnum
CREATE TYPE "AgtStatus" AS ENUM ('QUEUED', 'SENT', 'VALID', 'REJECTED');

-- CreateTable
CREATE TABLE "agt_submissions" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "AgtStatus" NOT NULL DEFAULT 'QUEUED',
    "requestId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "polls" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "errors" JSONB,
    "correctionOfDocumentNo" TEXT,
    "correctedByDocumentId" TEXT,
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agt_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agt_submissions_documentId_key" ON "agt_submissions"("documentId");

-- CreateIndex
CREATE INDEX "agt_submissions_status_nextAttemptAt_idx" ON "agt_submissions"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "agt_submissions_businessId_status_idx" ON "agt_submissions"("businessId", "status");

-- AddForeignKey
ALTER TABLE "agt_submissions" ADD CONSTRAINT "agt_submissions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

