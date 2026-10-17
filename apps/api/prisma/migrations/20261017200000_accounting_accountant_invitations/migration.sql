-- Accountant invitations to a company are pending until accepted
-- (an accountant who already has a login). Access given before this is accepted.
ALTER TABLE "accountant_access" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "accountant_access" ADD COLUMN "inviteTokenHash" TEXT;
ALTER TABLE "accountant_access" ADD COLUMN "inviteExpiresAt" TIMESTAMP(3);
UPDATE "accountant_access" SET "acceptedAt" = "createdAt";
CREATE UNIQUE INDEX "accountant_access_inviteTokenHash_key" ON "accountant_access"("inviteTokenHash");
