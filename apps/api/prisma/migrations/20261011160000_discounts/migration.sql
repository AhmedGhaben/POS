-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'APPLY_DISCOUNT';

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "maxDiscountPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "sale_line_items" ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "discountValue" DECIMAL(10,2),
ADD COLUMN     "lineDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "discountValue" DECIMAL(10,2),
ADD COLUMN     "saleDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
