-- A proforma's validity date, in its own table: issued fiscal documents
-- stay as they were signed (the fiscal_documents row is never changed).
CREATE TABLE "proforma_terms" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "validUntil" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proforma_terms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "proforma_terms_documentId_key" ON "proforma_terms"("documentId");

ALTER TABLE "proforma_terms" ADD CONSTRAINT "proforma_terms_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
