-- docs/plans/ANGOLA.md, phase 4: sales on credit (Factura) and receipts
-- (Recibo), customer and supplier balances, the supplier's document and IVA
-- on purchases.

-- CreateEnum
CREATE TYPE "PurchasePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "creditLimit" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentStatus" "PurchasePaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "supplierDocDate" DATE,
ADD COLUMN     "supplierDocHash" TEXT,
ADD COLUMN     "supplierDocNo" TEXT,
ADD COLUMN     "supplierDocType" TEXT,
ADD COLUMN     "withholdingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "withholdingPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "returns" ADD COLUMN     "accountCredit" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "creditAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "purchase_tax_lines" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "base" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "deductiblePercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "deductibleAmount" DECIMAL(14,2) NOT NULL,
    "typology" TEXT NOT NULL DEFAULT 'INV',

    CONSTRAINT "purchase_tax_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paidOn" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "saleId" TEXT,
    "shiftId" TEXT,
    "receivedById" TEXT NOT NULL,
    "clientId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "customer_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_tax_lines_purchaseId_idx" ON "purchase_tax_lines"("purchaseId");

-- CreateIndex
CREATE INDEX "supplier_payments_businessId_supplierId_idx" ON "supplier_payments"("businessId", "supplierId");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_paymentId_idx" ON "supplier_payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_purchaseId_idx" ON "supplier_payment_allocations"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payments_documentId_key" ON "customer_payments"("documentId");

-- CreateIndex
CREATE INDEX "customer_payments_businessId_customerId_idx" ON "customer_payments"("businessId", "customerId");

-- CreateIndex
CREATE INDEX "customer_payments_shiftId_idx" ON "customer_payments"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payments_storeId_clientId_key" ON "customer_payments"("storeId", "clientId");

-- CreateIndex
CREATE INDEX "customer_payment_allocations_paymentId_idx" ON "customer_payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "customer_payment_allocations_documentId_idx" ON "customer_payment_allocations"("documentId");

-- AddForeignKey
ALTER TABLE "purchase_tax_lines" ADD CONSTRAINT "purchase_tax_lines_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "supplier_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_allocations" ADD CONSTRAINT "customer_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "customer_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_allocations" ADD CONSTRAINT "customer_payment_allocations_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Purchases from before payables were recorded were paid when made.
UPDATE "purchases" SET "paidAmount" = "total", "paymentStatus" = 'PAID';

-- A receipt and how it was set against invoices are fiscal records: like
-- the documents, they can't be changed or deleted (a receipt is annulled
-- instead, on its document), except by the test clean-up session
-- (pos.allow_fiscal_delete = 'on').
CREATE OR REPLACE FUNCTION customer_payments_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('pos.allow_fiscal_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Customer payments and their allocations cannot be changed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_payments_immutable
  BEFORE UPDATE OR DELETE ON "customer_payments"
  FOR EACH ROW EXECUTE FUNCTION customer_payments_guard();

CREATE TRIGGER customer_payment_allocations_immutable
  BEFORE UPDATE OR DELETE ON "customer_payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION customer_payments_guard();
