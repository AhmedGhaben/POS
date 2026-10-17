-- CreateTable
CREATE TABLE "account_mappings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_source_links" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "entryId" TEXT,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "documentNo" TEXT,
    "documentDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_source_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_integration_errors" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "documentNo" TEXT,
    "documentDate" DATE NOT NULL,
    "message" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastTriedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_integration_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_mappings_businessId_key_key" ON "account_mappings"("businessId", "key");

-- CreateIndex
CREATE INDEX "accounting_source_links_entryId_idx" ON "accounting_source_links"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_source_links_businessId_sourceType_sourceId_key" ON "accounting_source_links"("businessId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_integration_errors_businessId_sourceType_sourceI_key" ON "accounting_integration_errors"("businessId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_source_links" ADD CONSTRAINT "accounting_source_links_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A link is either posted (to an entry) or skipped.
ALTER TABLE "accounting_source_links" ADD CONSTRAINT "accounting_source_links_posted_or_skipped" CHECK (("entryId" IS NULL) = "skipped");
-- The integration's links are its proof that nothing is posted twice: they stay.
CREATE TRIGGER accounting_source_links_immutable
  BEFORE UPDATE OR DELETE ON "accounting_source_links"
  FOR EACH ROW EXECUTE FUNCTION journal_immutable_guard();
