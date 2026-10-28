-- A sell price of 0 only for a product marked free (tester #39).
ALTER TABLE "products" ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false;
