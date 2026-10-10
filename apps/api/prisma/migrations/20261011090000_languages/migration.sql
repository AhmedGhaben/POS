-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "language" TEXT;

