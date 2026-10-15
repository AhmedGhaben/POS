-- CreateTable
CREATE TABLE "document_series" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "terminalId" TEXT,
    "documentType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "lastHash" TEXT NOT NULL DEFAULT '',
    "agtRegistered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "terminalId" TEXT,
    "seriesId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "documentNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'N',
    "statusDate" TIMESTAMP(3) NOT NULL,
    "statusReason" TEXT,
    "statusReasonCode" TEXT,
    "statusById" TEXT,
    "invoiceDate" DATE NOT NULL,
    "systemEntryDate" TIMESTAMP(3) NOT NULL,
    "period" INTEGER NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceBilling" TEXT NOT NULL DEFAULT 'P',
    "hash" TEXT NOT NULL,
    "hashControl" TEXT NOT NULL,
    "hashExcerpt" TEXT NOT NULL,
    "seller" JSONB NOT NULL,
    "customerId" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerTaxId" TEXT NOT NULL,
    "buyerAddress" JSONB,
    "currency" TEXT NOT NULL,
    "pricesIncludeTax" BOOLEAN NOT NULL,
    "netTotal" DECIMAL(14,2) NOT NULL,
    "taxPayable" DECIMAL(14,2) NOT NULL,
    "grossTotal" DECIMAL(14,2) NOT NULL,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payments" JSONB,
    "reason" TEXT,
    "saleId" TEXT,
    "returnId" TEXT,
    "referencedDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_document_lines" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" TEXT,
    "productCode" TEXT NOT NULL,
    "productDescription" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "referenceDocumentNo" TEXT,
    "referenceLineNumber" INTEGER,

    CONSTRAINT "fiscal_document_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_document_line_taxes" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "taxCountryRegion" TEXT NOT NULL,
    "taxCode" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "exemptionCode" TEXT,
    "exemptionReason" TEXT,

    CONSTRAINT "fiscal_document_line_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_series_terminalId_idx" ON "document_series"("terminalId");

-- CreateIndex
CREATE UNIQUE INDEX "document_series_businessId_documentType_code_key" ON "document_series"("businessId", "documentType", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_returnId_key" ON "fiscal_documents"("returnId");

-- CreateIndex
CREATE INDEX "fiscal_documents_businessId_invoiceDate_idx" ON "fiscal_documents"("businessId", "invoiceDate");

-- CreateIndex
CREATE INDEX "fiscal_documents_saleId_idx" ON "fiscal_documents"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_seriesId_number_key" ON "fiscal_documents"("seriesId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_businessId_documentNo_key" ON "fiscal_documents"("businessId", "documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_document_lines_documentId_lineNumber_key" ON "fiscal_document_lines"("documentId", "lineNumber");

-- CreateIndex
CREATE INDEX "fiscal_document_line_taxes_lineId_idx" ON "fiscal_document_line_taxes"("lineId");

-- AddForeignKey
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "document_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_referencedDocumentId_fkey" FOREIGN KEY ("referencedDocumentId") REFERENCES "fiscal_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_lines" ADD CONSTRAINT "fiscal_document_lines_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_line_taxes" ADD CONSTRAINT "fiscal_document_line_taxes_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "fiscal_document_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Fiscal documents are immutable. The only change allowed is the status:
-- annulling (N -> A) or a proforma becoming invoiced (N -> F), with when,
-- why and who. Deleting is refused unless the session sets
-- pos.allow_fiscal_delete = 'on' (test clean-up only).
CREATE OR REPLACE FUNCTION fiscal_documents_guard() RETURNS trigger AS $$
BEGIN
  -- Test clean-up (deleting documents that reference each other updates them first).
  IF current_setting('pos.allow_fiscal_delete', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Fiscal documents cannot be deleted (%)', OLD."documentNo";
  END IF;
  IF NOT (OLD.status = 'N' AND NEW.status IN ('A', 'F')) THEN
    RAISE EXCEPTION 'Fiscal document % cannot be changed', OLD."documentNo";
  END IF;
  IF NEW."documentNo" IS DISTINCT FROM OLD."documentNo"
    OR NEW."documentType" IS DISTINCT FROM OLD."documentType"
    OR NEW."seriesId" IS DISTINCT FROM OLD."seriesId"
    OR NEW."number" IS DISTINCT FROM OLD."number"
    OR NEW.hash IS DISTINCT FROM OLD.hash
    OR NEW."hashControl" IS DISTINCT FROM OLD."hashControl"
    OR NEW."invoiceDate" IS DISTINCT FROM OLD."invoiceDate"
    OR NEW."systemEntryDate" IS DISTINCT FROM OLD."systemEntryDate"
    OR NEW."grossTotal" IS DISTINCT FROM OLD."grossTotal"
    OR NEW."netTotal" IS DISTINCT FROM OLD."netTotal"
    OR NEW."taxPayable" IS DISTINCT FROM OLD."taxPayable"
    OR NEW."buyerName" IS DISTINCT FROM OLD."buyerName"
    OR NEW."buyerTaxId" IS DISTINCT FROM OLD."buyerTaxId"
    OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
    OR NEW.seller::text IS DISTINCT FROM OLD.seller::text
    OR NEW."saleId" IS DISTINCT FROM OLD."saleId"
    OR NEW."returnId" IS DISTINCT FROM OLD."returnId"
    OR NEW."referencedDocumentId" IS DISTINCT FROM OLD."referencedDocumentId" THEN
    RAISE EXCEPTION 'Fiscal document % cannot be changed, only annulled', OLD."documentNo";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fiscal_documents_immutable
  BEFORE UPDATE OR DELETE ON "fiscal_documents"
  FOR EACH ROW EXECUTE FUNCTION fiscal_documents_guard();

-- Lines and their taxes never change.
CREATE OR REPLACE FUNCTION fiscal_lines_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('pos.allow_fiscal_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Fiscal document lines cannot be changed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fiscal_document_lines_immutable
  BEFORE UPDATE OR DELETE ON "fiscal_document_lines"
  FOR EACH ROW EXECUTE FUNCTION fiscal_lines_guard();

CREATE TRIGGER fiscal_document_line_taxes_immutable
  BEFORE UPDATE OR DELETE ON "fiscal_document_line_taxes"
  FOR EACH ROW EXECUTE FUNCTION fiscal_lines_guard();
