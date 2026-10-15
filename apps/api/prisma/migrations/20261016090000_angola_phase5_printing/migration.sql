-- docs/plans/ANGOLA.md, phase 5: store print defaults and the print log of
-- fiscal documents (first print = original, later = 2ª Via).

-- CreateEnum
CREATE TYPE "SaleDocumentFormat" AS ENUM ('RECEIPT', 'A4');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "documentCopies" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "saleDocumentFormat" "SaleDocumentFormat" NOT NULL DEFAULT 'RECEIPT';

-- CreateTable
CREATE TABLE "document_prints" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "reprint" BOOLEAN NOT NULL,
    "printedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_prints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_prints_documentId_idx" ON "document_prints"("documentId");

-- AddForeignKey
ALTER TABLE "document_prints" ADD CONSTRAINT "document_prints_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

