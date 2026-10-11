-- CreateTable
CREATE TABLE "terminal_pairing_codes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "terminalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_pairing_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terminal_pairing_codes_codeHash_idx" ON "terminal_pairing_codes"("codeHash");

-- AddForeignKey
ALTER TABLE "terminal_pairing_codes" ADD CONSTRAINT "terminal_pairing_codes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

