-- CreateEnum
CREATE TYPE "IvaRegime" AS ENUM ('GERAL', 'SIMPLIFICADO', 'EXCLUSAO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'CREDIT_CARD';
ALTER TYPE "PaymentMethod" ADD VALUE 'MULTICAIXA_REFERENCE';
ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_TRANSFER';
ALTER TYPE "PaymentMethod" ADD VALUE 'CHEQUE';

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'AO',
ADD COLUMN     "eInvoicingActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "eacCode" TEXT,
ADD COLUMN     "legalForm" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "province" TEXT,
ALTER COLUMN "shiftDifferenceThreshold" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "cash_movements" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'AO',
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "province" TEXT;

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "wage" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "expenses" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "sellPrice" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "purchase_line_items" ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "purchases" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "return_line_items" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "returns" ALTER COLUMN "totalRefund" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "sale_line_items" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "discountValue" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "lineDiscountAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "originalUnitPrice" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "sale_payments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "tendered" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "change" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "discountTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "amountTendered" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "changeDue" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "discountValue" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "saleDiscountAmount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "shifts" ALTER COLUMN "openingFloat" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "countedCash" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "expectedCash" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "tillExpectedCash" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "difference" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'AO',
ADD COLUMN     "ivaRegime" "IvaRegime" NOT NULL DEFAULT 'GERAL',
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "province" TEXT;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'AO',
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "taxId" TEXT;

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "showOnQuotes" BOOLEAN NOT NULL DEFAULT true,
    "showOnInvoices" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "taxType" TEXT NOT NULL DEFAULT 'IVA',
    "taxCode" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "region" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "verifyValidity" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_accounts_businessId_idx" ON "bank_accounts"("businessId");

-- CreateIndex
CREATE INDEX "tax_rates_businessId_idx" ON "tax_rates"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_businessId_key_key" ON "tax_rates"("businessId", "key");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing stores priced their products before tax: keep that until their
-- owner switches "prices include IVA" on. New stores start with it on.
UPDATE "stores" SET "pricesIncludeTax" = false;
