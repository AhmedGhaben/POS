-- AlterEnum
ALTER TYPE "DrawerOpenReason" ADD VALUE 'SALE_VOIDED';

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'VOID_SALE';

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "voidNote" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
