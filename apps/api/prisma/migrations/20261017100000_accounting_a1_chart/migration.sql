-- CreateEnum
CREATE TYPE "LedgerAccountCategory" AS ENUM ('GR', 'GA', 'GM', 'AR', 'AA', 'AM');

-- CreateTable
CREATE TABLE "accounting_settings" (
    "businessId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATE NOT NULL,
    "cashPerTill" BOOLEAN NOT NULL DEFAULT true,
    "grouping" TEXT NOT NULL DEFAULT 'PER_DOCUMENT',
    "autoPost" BOOLEAN NOT NULL DEFAULT true,
    "purchasesFile" TEXT NOT NULL DEFAULT 'AUTO',
    "enabledAt" TIMESTAMP(3),
    "enabledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_settings_pkey" PRIMARY KEY ("businessId")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "LedgerAccountCategory" NOT NULL,
    "parentId" TEXT,
    "classNo" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "linkType" TEXT,
    "linkId" TEXT,
    "fromTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_accounts_parentId_idx" ON "ledger_accounts"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_businessId_code_key" ON "ledger_accounts"("businessId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_businessId_linkType_linkId_key" ON "ledger_accounts"("businessId", "linkType", "linkId");

-- AddForeignKey
ALTER TABLE "accounting_settings" ADD CONSTRAINT "accounting_settings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SAF-T AccountID (1-30 of [0-9a-zA-Z-/._+*]) and AccountDescription (1-100).
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_code_format" CHECK ("code" ~ '^[0-9A-Za-z./_+*-]{1,30}$');
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_name_length" CHECK (char_length("name") BETWEEN 1 AND 100);
