import { PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SEED_OWNER_EMAIL = "owner@demo-store.test";
const SEED_OWNER_PASSWORD = "OwnerPass123!";
const SEED_CASHIER_EMAIL = "cashier@demo-store.test";
const SEED_CASHIER_PASSWORD = "CashierPass123!";

async function main() {
  const business = await prisma.business.upsert({
    where: { id: "seed-business" },
    create: { id: "seed-business", name: "Demo Retail Co.", plan: "SIMPLE" },
    update: {},
  });

  const store = await prisma.store.upsert({
    where: { id: "seed-store-main" },
    create: {
      id: "seed-store-main",
      businessId: business.id,
      name: "Main Street Store",
      address: "123 Main St",
      timezone: "UTC",
    },
    update: {},
  });

  const ownerPasswordHash = await bcrypt.hash(SEED_OWNER_PASSWORD, 12);
  const owner = await prisma.user.upsert({
    where: { email: SEED_OWNER_EMAIL },
    create: {
      businessId: business.id,
      email: SEED_OWNER_EMAIL,
      passwordHash: ownerPasswordHash,
      firstName: "Ada",
      lastName: "Owner",
      role: Role.OWNER,
    },
    update: {},
  });

  const cashierPasswordHash = await bcrypt.hash(SEED_CASHIER_PASSWORD, 12);
  const cashier = await prisma.user.upsert({
    where: { email: SEED_CASHIER_EMAIL },
    create: {
      businessId: business.id,
      email: SEED_CASHIER_EMAIL,
      passwordHash: cashierPasswordHash,
      firstName: "Cara",
      lastName: "Cashier",
      role: Role.CASHIER,
    },
    update: {},
  });

  await prisma.storeUser.upsert({
    where: { userId_storeId: { userId: cashier.id, storeId: store.id } },
    create: { userId: cashier.id, storeId: store.id },
    update: {},
  });

  const category = await prisma.category.upsert({
    where: { businessId_name: { businessId: business.id, name: "Beverages" } },
    create: { businessId: business.id, name: "Beverages" },
    update: {},
  });

  const products = [
    {
      sku: "BEV-001",
      barcode: "012345678905",
      name: "Sparkling Water 500ml",
      costPrice: "0.60",
      sellPrice: "1.50",
      taxRate: "8.00",
      stock: 120,
    },
    {
      sku: "BEV-002",
      barcode: "012345678912",
      name: "Cold Brew Coffee 12oz",
      costPrice: "1.20",
      sellPrice: "3.25",
      taxRate: "8.00",
      stock: 60,
    },
    {
      sku: "SNK-001",
      barcode: "012345678929",
      name: "Trail Mix 100g",
      costPrice: "0.90",
      sellPrice: "2.75",
      taxRate: "8.00",
      stock: 80,
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { businessId_sku: { businessId: business.id, sku: p.sku } },
      create: {
        businessId: business.id,
        categoryId: category.id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        costPrice: p.costPrice,
        sellPrice: p.sellPrice,
        taxRate: p.taxRate,
      },
      update: {},
    });

    await prisma.inventoryItem.upsert({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
      create: {
        storeId: store.id,
        productId: product.id,
        quantity: p.stock,
        reorderLevel: 10,
      },
      update: { quantity: p.stock },
    });
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete.");
  // eslint-disable-next-line no-console
  console.log(`  Owner login:   ${SEED_OWNER_EMAIL} / ${SEED_OWNER_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log(`  Cashier login: ${SEED_CASHIER_EMAIL} / ${SEED_CASHIER_PASSWORD}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
