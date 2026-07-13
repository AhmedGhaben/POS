import { PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SEED_OWNER_EMAIL = "owner@demo-store.test";
const SEED_OWNER_PASSWORD = "OwnerPass123!";
const SEED_CASHIER_EMAIL = "cashier@demo-store.test";
const SEED_CASHIER_PASSWORD = "CashierPass123!";

/** [name, costPrice, sellPrice, taxRate] */
type ProductSeed = [string, number, number, number];

const CATALOG: Record<string, ProductSeed[]> = {
  Beverages: [
    ["Sparkling Water 500ml", 0.6, 1.5, 8],
    ["Cold Brew Coffee 12oz", 1.2, 3.25, 8],
    ["Orange Juice 1L", 1.8, 3.99, 8],
    ["Green Tea Bottle 16oz", 1.1, 2.79, 8],
    ["Energy Drink 8oz", 0.95, 2.99, 8],
    ["Sports Drink 20oz", 0.85, 2.49, 8],
    ["Sparkling Lemonade 500ml", 0.7, 1.99, 8],
  ],
  Snacks: [
    ["Trail Mix 100g", 0.9, 2.75, 8],
    ["Potato Chips 150g", 0.75, 2.49, 8],
    ["Pretzels 200g", 0.65, 2.19, 8],
    ["Chocolate Bar 45g", 0.4, 1.75, 8],
    ["Granola Bar Box", 1.5, 3.99, 8],
    ["Popcorn 100g", 0.5, 1.99, 8],
  ],
  Dairy: [
    ["Whole Milk 1L", 0.95, 1.99, 0],
    ["Greek Yogurt 500g", 1.4, 3.49, 0],
    ["Cheddar Cheese 200g", 2.1, 4.99, 0],
    ["Butter 250g", 1.6, 3.79, 0],
    ["Eggs (Dozen)", 1.9, 3.99, 0],
  ],
  Bakery: [
    ["Sourdough Loaf", 1.3, 3.49, 0],
    ["Croissant", 0.6, 1.99, 0],
    ["Bagel (6-pack)", 1.1, 2.99, 0],
    ["Blueberry Muffin", 0.7, 2.29, 0],
    ["Baguette", 0.5, 1.79, 0],
  ],
  Produce: [
    ["Bananas (lb)", 0.3, 0.69, 0],
    ["Avocado", 0.5, 1.29, 0],
    ["Roma Tomatoes (lb)", 0.6, 1.49, 0],
    ["Baby Spinach 5oz", 1.1, 2.99, 0],
    ["Red Apples (lb)", 0.55, 1.39, 0],
    ["Carrots (lb)", 0.35, 0.99, 0],
  ],
  "Meat & Seafood": [
    ["Chicken Breast (lb)", 2.4, 4.99, 0],
    ["Ground Beef (lb)", 2.9, 5.49, 0],
    ["Salmon Fillet (lb)", 5.5, 9.99, 0],
    ["Bacon 12oz", 3.1, 5.99, 0],
    ["Shrimp 1lb Bag", 6.2, 10.99, 0],
  ],
  "Frozen Foods": [
    ["Frozen Pizza", 2.2, 5.49, 8],
    ["Ice Cream Pint", 1.8, 4.29, 8],
    ["Frozen Mixed Veggies", 0.9, 2.29, 8],
    ["Frozen Waffles", 1.2, 3.29, 8],
    ["Frozen Burritos (4-pack)", 2.0, 4.99, 8],
  ],
  Household: [
    ["Paper Towels (6-roll)", 3.5, 7.99, 8],
    ["Dish Soap 500ml", 1.1, 2.99, 8],
    ["Laundry Detergent 1L", 3.8, 8.49, 8],
    ["Trash Bags (30-pack)", 2.6, 5.99, 8],
    ["All-Purpose Cleaner", 1.4, 3.49, 8],
    ["Aluminum Foil Roll", 1.9, 3.99, 8],
  ],
  "Personal Care": [
    ["Toothpaste 100ml", 1.0, 2.79, 8],
    ["Shampoo 400ml", 2.2, 5.49, 8],
    ["Bar Soap (3-pack)", 1.3, 3.29, 8],
    ["Deodorant Stick", 1.6, 3.99, 8],
    ["Hand Sanitizer 250ml", 0.9, 2.49, 8],
  ],
  Electronics: [
    ["AA Batteries (4-pack)", 1.8, 4.49, 8],
    ["USB-C Cable 1m", 1.5, 5.99, 8],
    ["Earbuds (Basic)", 4.2, 9.99, 8],
    ["Phone Charger 20W", 3.8, 8.99, 8],
    ["Portable Power Bank", 6.5, 14.99, 8],
  ],
  Stationery: [
    ["Ballpoint Pens (5-pack)", 0.8, 2.29, 8],
    ["Spiral Notebook", 0.9, 2.49, 8],
    ["Sticky Notes", 0.6, 1.79, 8],
    ["Printer Paper Ream", 3.4, 6.99, 8],
    ["Highlighters (4-pack)", 1.1, 2.99, 8],
  ],
  "Toys & Games": [
    ["Deck of Playing Cards", 0.7, 2.49, 8],
    ["Puzzle 500pc", 3.2, 7.99, 8],
    ["Bouncy Ball", 0.3, 1.49, 8],
    ["Coloring Book", 0.9, 2.99, 8],
    ["Mini Puzzle Cube", 1.4, 3.99, 8],
  ],
  "Pet Supplies": [
    ["Dog Food 2lb Bag", 3.5, 7.49, 8],
    ["Cat Litter 10lb", 3.8, 7.99, 8],
    ["Dog Treats", 1.6, 3.99, 8],
    ["Cat Food Can", 0.6, 1.49, 8],
    ["Pet Waste Bags", 1.1, 2.79, 8],
  ],
};

function toBarcode(index: number): string {
  return `0${(100000000000 + index).toString().slice(-11)}`;
}

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

  let productIndex = 0;
  let totalProducts = 0;
  const createdProducts: { id: string; name: string }[] = [];

  for (const [categoryName, productSeeds] of Object.entries(CATALOG)) {
    const category = await prisma.category.upsert({
      where: { businessId_name: { businessId: business.id, name: categoryName } },
      create: { businessId: business.id, name: categoryName },
      update: {},
    });

    const prefix = categoryName
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 3)
      .toUpperCase();

    for (const [name, costPrice, sellPrice, taxRate] of productSeeds) {
      productIndex += 1;
      const sku = `${prefix}-${String(productIndex).padStart(3, "0")}`;
      const stock = 20 + ((productIndex * 7) % 100);

      const product = await prisma.product.upsert({
        where: { businessId_sku: { businessId: business.id, sku } },
        create: {
          businessId: business.id,
          categoryId: category.id,
          sku,
          barcode: toBarcode(productIndex),
          name,
          costPrice: costPrice.toFixed(2),
          sellPrice: sellPrice.toFixed(2),
          taxRate: taxRate.toFixed(2),
        },
        update: {},
      });

      await prisma.inventoryItem.upsert({
        where: { storeId_productId: { storeId: store.id, productId: product.id } },
        create: {
          storeId: store.id,
          productId: product.id,
          quantity: stock,
          reorderLevel: 10,
        },
        update: { quantity: stock },
      });

      createdProducts.push({ id: product.id, name: product.name });
      totalProducts += 1;
    }
  }

  // --- Phase 2: suppliers, an employee, a purchase, an expense ---

  const supplierSeeds = [
    { name: "Northgate Wholesale", contactName: "Priya Shah", phone: "555-0101", email: "orders@northgate.test" },
    { name: "Coastal Produce Co.", contactName: "Marco Reyes", phone: "555-0102", email: "sales@coastalproduce.test" },
    { name: "Summit Beverage Distributors", contactName: "Lena Ortiz", phone: "555-0103", email: "hello@summitbev.test" },
  ];
  const suppliers = [];
  for (const s of supplierSeeds) {
    const existing = await prisma.supplier.findFirst({ where: { businessId: business.id, name: s.name } });
    suppliers.push(existing ?? (await prisma.supplier.create({ data: { businessId: business.id, ...s } })));
  }

  await prisma.employee.upsert({
    where: { userId: cashier.id },
    create: {
      businessId: business.id,
      userId: cashier.id,
      storeId: store.id,
      firstName: cashier.firstName,
      lastName: cashier.lastName,
      position: "Cashier",
      hireDate: new Date("2026-01-15"),
      wage: "18.50",
    },
    update: {},
  });
  await prisma.employee.upsert({
    where: { userId: owner.id },
    create: {
      businessId: business.id,
      userId: owner.id,
      firstName: owner.firstName,
      lastName: owner.lastName,
      position: "Owner / General Manager",
      hireDate: new Date("2024-03-01"),
    },
    update: {},
  });

  const existingPurchase = await prisma.purchase.findFirst({ where: { storeId: store.id } });
  if (!existingPurchase && createdProducts.length >= 2) {
    const lineItems = createdProducts.slice(0, 2).map((p) => ({
      productId: p.id,
      quantity: 24,
      unitCost: "1.00",
      lineTotal: "24.00",
    }));
    await prisma.purchase.create({
      data: {
        storeId: store.id,
        supplierId: suppliers[0].id,
        createdById: owner.id,
        purchaseNumber: `PO-SEED-${Date.now()}`,
        subtotal: "48.00",
        taxTotal: "0.00",
        total: "48.00",
        status: "RECEIVED",
        lineItems: { create: lineItems },
      },
    });
  }

  const existingExpense = await prisma.expense.findFirst({ where: { storeId: store.id } });
  if (!existingExpense) {
    await prisma.expense.createMany({
      data: [
        {
          storeId: store.id,
          createdById: owner.id,
          category: "RENT",
          description: "Monthly storefront rent",
          amount: "2400.00",
          incurredAt: new Date("2026-07-01"),
        },
        {
          storeId: store.id,
          createdById: owner.id,
          category: "UTILITIES",
          description: "Electricity & water",
          amount: "310.25",
          incurredAt: new Date("2026-07-05"),
        },
      ],
    });
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete.");
  // eslint-disable-next-line no-console
  console.log(`  Categories: ${Object.keys(CATALOG).length}, Products: ${totalProducts}`);
  // eslint-disable-next-line no-console
  console.log(`  Suppliers: ${suppliers.length}`);
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
