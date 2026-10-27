-- Suppliers with purchases or payments can be archived instead of deleted:
-- hidden from pickers, still in reports and SAF-T.
ALTER TABLE "suppliers" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
