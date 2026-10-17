-- CreateTable
CREATE TABLE "bank_statements" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "importedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(16,2) NOT NULL,
    "matchedLineId" TEXT,
    "matchKind" TEXT,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_statements_businessId_accountId_idx" ON "bank_statements"("businessId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_matchedLineId_key" ON "bank_statement_lines"("matchedLineId");

-- CreateIndex
CREATE INDEX "bank_statement_lines_statementId_idx" ON "bank_statement_lines"("statementId");

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "bank_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
