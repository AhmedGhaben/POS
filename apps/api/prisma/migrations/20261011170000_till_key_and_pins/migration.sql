-- AlterTable
ALTER TABLE "terminals" ADD COLUMN     "keyHash" TEXT,
ADD COLUMN     "keyIssuedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pinFailedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "terminals_keyHash_key" ON "terminals"("keyHash");

