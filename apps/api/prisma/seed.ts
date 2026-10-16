import { Prisma, PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { countryConfig } from "../src/countries";

const prisma = new PrismaClient();

const SEED_OWNER_EMAIL = "owner@demo-store.test";
const SEED_OWNER_PASSWORD = "OwnerPass123!";
const SEED_CASHIER_EMAIL = "cashier@demo-store.test";
const SEED_CASHIER_PASSWORD = "CashierPass123!";

/**
 * [name, costPrice, sellPrice, tax]: the tax is the IVA rate (14, Taxa
 * geral) or, for an exempt product, its exemption reason ("M10", bens
 * alimentares: no fiscal document may have an exempt line without one).
 */
type ProductSeed = [string, number, number, 14 | "M10"];

const CATALOG: Record<string, ProductSeed[]> = {
  Beverages: [
    ["Sparkling Water 500ml", 0.6, 1.5, 14],
    ["Cold Brew Coffee 12oz", 1.2, 3.25, 14],
    ["Orange Juice 1L", 1.8, 3.99, 14],
    ["Green Tea Bottle 16oz", 1.1, 2.79, 14],
    ["Energy Drink 8oz", 0.95, 2.99, 14],
    ["Sports Drink 20oz", 0.85, 2.49, 14],
    ["Sparkling Lemonade 500ml", 0.7, 1.99, 14],
  ],
  Snacks: [
    ["Trail Mix 100g", 0.9, 2.75, 14],
    ["Potato Chips 150g", 0.75, 2.49, 14],
    ["Pretzels 200g", 0.65, 2.19, 14],
    ["Chocolate Bar 45g", 0.4, 1.75, 14],
    ["Granola Bar Box", 1.5, 3.99, 14],
    ["Popcorn 100g", 0.5, 1.99, 14],
  ],
  Dairy: [
    ["Whole Milk 1L", 0.95, 1.99, "M10"],
    ["Greek Yogurt 500g", 1.4, 3.49, "M10"],
    ["Cheddar Cheese 200g", 2.1, 4.99, "M10"],
    ["Butter 250g", 1.6, 3.79, "M10"],
    ["Eggs (Dozen)", 1.9, 3.99, "M10"],
  ],
  Bakery: [
    ["Sourdough Loaf", 1.3, 3.49, "M10"],
    ["Croissant", 0.6, 1.99, "M10"],
    ["Bagel (6-pack)", 1.1, 2.99, "M10"],
    ["Blueberry Muffin", 0.7, 2.29, "M10"],
    ["Baguette", 0.5, 1.79, "M10"],
  ],
  Produce: [
    ["Bananas (lb)", 0.3, 0.69, "M10"],
    ["Avocado", 0.5, 1.29, "M10"],
    ["Roma Tomatoes (lb)", 0.6, 1.49, "M10"],
    ["Baby Spinach 5oz", 1.1, 2.99, "M10"],
    ["Red Apples (lb)", 0.55, 1.39, "M10"],
    ["Carrots (lb)", 0.35, 0.99, "M10"],
  ],
  "Meat & Seafood": [
    ["Chicken Breast (lb)", 2.4, 4.99, "M10"],
    ["Ground Beef (lb)", 2.9, 5.49, "M10"],
    ["Salmon Fillet (lb)", 5.5, 9.99, "M10"],
    ["Bacon 12oz", 3.1, 5.99, "M10"],
    ["Shrimp 1lb Bag", 6.2, 10.99, "M10"],
  ],
  "Frozen Foods": [
    ["Frozen Pizza", 2.2, 5.49, 14],
    ["Ice Cream Pint", 1.8, 4.29, 14],
    ["Frozen Mixed Veggies", 0.9, 2.29, 14],
    ["Frozen Waffles", 1.2, 3.29, 14],
    ["Frozen Burritos (4-pack)", 2.0, 4.99, 14],
  ],
  Household: [
    ["Paper Towels (6-roll)", 3.5, 7.99, 14],
    ["Dish Soap 500ml", 1.1, 2.99, 14],
    ["Laundry Detergent 1L", 3.8, 8.49, 14],
    ["Trash Bags (30-pack)", 2.6, 5.99, 14],
    ["All-Purpose Cleaner", 1.4, 3.49, 14],
    ["Aluminum Foil Roll", 1.9, 3.99, 14],
  ],
  "Personal Care": [
    ["Toothpaste 100ml", 1.0, 2.79, 14],
    ["Shampoo 400ml", 2.2, 5.49, 14],
    ["Bar Soap (3-pack)", 1.3, 3.29, 14],
    ["Deodorant Stick", 1.6, 3.99, 14],
    ["Hand Sanitizer 250ml", 0.9, 2.49, 14],
  ],
  Electronics: [
    ["AA Batteries (4-pack)", 1.8, 4.49, 14],
    ["USB-C Cable 1m", 1.5, 5.99, 14],
    ["Earbuds (Basic)", 4.2, 9.99, 14],
    ["Phone Charger 20W", 3.8, 8.99, 14],
    ["Portable Power Bank", 6.5, 14.99, 14],
  ],
  Stationery: [
    ["Ballpoint Pens (5-pack)", 0.8, 2.29, 14],
    ["Spiral Notebook", 0.9, 2.49, 14],
    ["Sticky Notes", 0.6, 1.79, 14],
    ["Printer Paper Ream", 3.4, 6.99, 14],
    ["Highlighters (4-pack)", 1.1, 2.99, 14],
  ],
  "Toys & Games": [
    ["Deck of Playing Cards", 0.7, 2.49, 14],
    ["Puzzle 500pc", 3.2, 7.99, 14],
    ["Bouncy Ball", 0.3, 1.49, 14],
    ["Coloring Book", 0.9, 2.99, 14],
    ["Mini Puzzle Cube", 1.4, 3.99, 14],
  ],
  "Pet Supplies": [
    ["Dog Food 2lb Bag", 3.5, 7.49, 14],
    ["Cat Litter 10lb", 3.8, 7.99, 14],
    ["Dog Treats", 1.6, 3.99, 14],
    ["Cat Food Can", 0.6, 1.49, 14],
    ["Pet Waste Bags", 1.1, 2.79, 14],
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

  // "Consumidor Final" (NIF 999999999): every sale without a chosen customer.
  if (!(await prisma.customer.findFirst({ where: { businessId: business.id, isFinalConsumer: true } }))) {
    await prisma.customer.create({
      data: { businessId: business.id, name: "Consumidor Final", taxId: "999999999", isFinalConsumer: true },
    });
  }

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
      emailVerifiedAt: new Date(),
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
      emailVerifiedAt: new Date(),
    },
    update: {},
  });

  await prisma.storeUser.upsert({
    where: { userId_storeId: { userId: cashier.id, storeId: store.id } },
    create: { userId: cashier.id, storeId: store.id },
    update: {},
  });

  // The country's IVA rates (Taxa geral 14% the default), as the app creates them.
  const config = countryConfig(business.country);
  for (const r of config?.taxRates ?? []) {
    await prisma.taxRate.upsert({
      where: { businessId_key: { businessId: business.id, key: r.key } },
      create: {
        businessId: business.id,
        key: r.key,
        name: r.name,
        taxType: r.taxType,
        taxCode: r.taxCode,
        percentage: new Prisma.Decimal(r.percentage),
        region: r.region,
        isDefault: r.isDefault,
        verifyValidity: !!r.verifyValidity,
        note: r.note ?? null,
      },
      update: {},
    });
  }
  const generalRate = await prisma.taxRate.findFirst({ where: { businessId: business.id, isDefault: true } });
  const taxFields = (tax: ProductSeed[3]) =>
    tax === "M10"
      ? { taxRate: "0.00", taxCode: "ISE", exemptionCode: "M10", taxRateId: null }
      : { taxRate: tax.toFixed(2), taxCode: "NOR", exemptionCode: null, taxRateId: generalRate?.id ?? null };

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

    for (const [name, costPrice, sellPrice, tax] of productSeeds) {
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
          ...taxFields(tax),
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

  console.log("Seed complete.");
  console.log(`  Categories: ${Object.keys(CATALOG).length}, Products: ${totalProducts}`);
  console.log(`  Suppliers: ${suppliers.length}`);
  console.log(`  Owner login:   ${SEED_OWNER_EMAIL} / ${SEED_OWNER_PASSWORD}`);
  console.log(`  Cashier login: ${SEED_CASHIER_EMAIL} / ${SEED_CASHIER_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
