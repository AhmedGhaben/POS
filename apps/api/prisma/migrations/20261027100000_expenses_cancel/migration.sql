-- Expenses are cancelled (with who, when and why) instead of deleted; a
-- cancelled expense that was posted to accounting is reversed (estorno).
ALTER TABLE "expenses" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "expenses" ADD COLUMN "cancelledById" TEXT;
ALTER TABLE "expenses" ADD COLUMN "cancelReason" TEXT;
