-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ACCOUNTANT';

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "businessId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ocpcaNumber" TEXT;

-- CreateTable
CREATE TABLE "accountant_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "accountant_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accountant_access_businessId_idx" ON "accountant_access"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_access_userId_businessId_key" ON "accountant_access"("userId", "businessId");

-- AddForeignKey
ALTER TABLE "accountant_access" ADD CONSTRAINT "accountant_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_access" ADD CONSTRAINT "accountant_access_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
