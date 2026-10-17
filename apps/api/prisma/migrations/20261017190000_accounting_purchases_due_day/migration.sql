-- The monthly purchases file's due day, when the business wants its own (null: the country's).
ALTER TABLE "accounting_settings" ADD COLUMN "purchasesFileDueDay" INTEGER;
ALTER TABLE "accounting_settings" ADD CONSTRAINT "accounting_settings_purchases_due_day_check" CHECK ("purchasesFileDueDay" BETWEEN 1 AND 31);
