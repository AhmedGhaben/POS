-- Online sales may take stock below zero when the business allows it (tester #32).
ALTER TABLE "businesses" ADD COLUMN "allowSellingWithoutStock" BOOLEAN NOT NULL DEFAULT false;
