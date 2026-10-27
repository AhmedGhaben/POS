-- Whether the emailed receipt went (PENDING, SENT, FAILED) and why not, so the
-- cashier can see it; sending stays after the sale is saved.
ALTER TABLE "sales" ADD COLUMN "receiptEmailStatus" TEXT;
ALTER TABLE "sales" ADD COLUMN "receiptEmailError" TEXT;
