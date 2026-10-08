-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "address" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "defaultTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "invoiceFooter" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "logo" BYTEA,
ADD COLUMN     "logoMimeType" TEXT,
ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "receiptFooter" TEXT,
ADD COLUMN     "receiptHeader" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "taxId" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "phone" TEXT;
