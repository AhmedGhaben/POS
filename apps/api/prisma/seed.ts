import { Prisma, PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { countryConfig } from "../src/countries";
import { hashPin } from "../src/common/utils/pin";

const prisma = new PrismaClient();

const SEED_OWNER_EMAIL = "owner@demo-store.test";
const SEED_OWNER_PASSWORD = "OwnerPass123!";
const SEED_CASHIER_EMAIL = "cashier@demo-store.test";
const SEED_CASHIER_PASSWORD = "CashierPass123!";
/** Till PINs, so the demo can sign in by name on a till and approve as a manager. */
const SEED_OWNER_PIN = "8642";
const SEED_CASHIER_PIN = "2468";

/**
 * [name, costPrice, sellPrice, tax], prices in kwanzas: the tax is the IVA
 * rate (14, Taxa geral) or, for an exempt product, its exemption reason
 * ("M10", bens alimentares: no fiscal document may have an exempt line
 * without one).
 */
type ProductSeed = [string, number, number, 14 | "M10"];

const CATALOG: Record<string, ProductSeed[]> = {
  Beverages: [
    ["Sparkling Water 500ml", 600, 1500, 14],
    ["Cold Brew Coffee 12oz", 1200, 3250, 14],
    ["Orange Juice 1L", 1800, 3990, 14],
    ["Green Tea Bottle 16oz", 1100, 2790, 14],
    ["Energy Drink 8oz", 950, 2990, 14],
    ["Sports Drink 20oz", 850, 2490, 14],
    ["Sparkling Lemonade 500ml", 700, 1990, 14],
  ],
  Snacks: [
    ["Trail Mix 100g", 900, 2750, 14],
    ["Potato Chips 150g", 750, 2490, 14],
    ["Pretzels 200g", 650, 2190, 14],
    ["Chocolate Bar 45g", 400, 1750, 14],
    ["Granola Bar Box", 1500, 3990, 14],
    ["Popcorn 100g", 500, 1990, 14],
  ],
  Dairy: [
    ["Whole Milk 1L", 950, 1990, "M10"],
    ["Greek Yogurt 500g", 1400, 3490, "M10"],
    ["Cheddar Cheese 200g", 2100, 4990, "M10"],
    ["Butter 250g", 1600, 3790, "M10"],
    ["Eggs (Dozen)", 1900, 3990, "M10"],
  ],
  Bakery: [
    ["Sourdough Loaf", 1300, 3490, "M10"],
    ["Croissant", 600, 1990, "M10"],
    ["Bagel (6-pack)", 1100, 2990, "M10"],
    ["Blueberry Muffin", 700, 2290, "M10"],
    ["Baguette", 500, 1790, "M10"],
  ],
  Produce: [
    ["Bananas (lb)", 300, 690, "M10"],
    ["Avocado", 500, 1290, "M10"],
    ["Roma Tomatoes (lb)", 600, 1490, "M10"],
    ["Baby Spinach 5oz", 1100, 2990, "M10"],
    ["Red Apples (lb)", 550, 1390, "M10"],
    ["Carrots (lb)", 350, 990, "M10"],
  ],
  "Meat & Seafood": [
    ["Chicken Breast (lb)", 2400, 4990, "M10"],
    ["Ground Beef (lb)", 2900, 5490, "M10"],
    ["Salmon Fillet (lb)", 5500, 9990, "M10"],
    ["Bacon 12oz", 3100, 5990, "M10"],
    ["Shrimp 1lb Bag", 6200, 10990, "M10"],
  ],
  "Frozen Foods": [
    ["Frozen Pizza", 2200, 5490, 14],
    ["Ice Cream Pint", 1800, 4290, 14],
    ["Frozen Mixed Veggies", 900, 2290, 14],
    ["Frozen Waffles", 1200, 3290, 14],
    ["Frozen Burritos (4-pack)", 2000, 4990, 14],
  ],
  Household: [
    ["Paper Towels (6-roll)", 3500, 7990, 14],
    ["Dish Soap 500ml", 1100, 2990, 14],
    ["Laundry Detergent 1L", 3800, 8490, 14],
    ["Trash Bags (30-pack)", 2600, 5990, 14],
    ["All-Purpose Cleaner", 1400, 3490, 14],
    ["Aluminum Foil Roll", 1900, 3990, 14],
  ],
  "Personal Care": [
    ["Toothpaste 100ml", 1000, 2790, 14],
    ["Shampoo 400ml", 2200, 5490, 14],
    ["Bar Soap (3-pack)", 1300, 3290, 14],
    ["Deodorant Stick", 1600, 3990, 14],
    ["Hand Sanitizer 250ml", 900, 2490, 14],
  ],
  Electronics: [
    ["AA Batteries (4-pack)", 1800, 4490, 14],
    ["USB-C Cable 1m", 1500, 5990, 14],
    ["Earbuds (Basic)", 4200, 9990, 14],
    ["Phone Charger 20W", 3800, 8990, 14],
    ["Portable Power Bank", 6500, 14990, 14],
  ],
  Stationery: [
    ["Ballpoint Pens (5-pack)", 800, 2290, 14],
    ["Spiral Notebook", 900, 2490, 14],
    ["Sticky Notes", 600, 1790, 14],
    ["Printer Paper Ream", 3400, 6990, 14],
    ["Highlighters (4-pack)", 1100, 2990, 14],
  ],
  "Toys & Games": [
    ["Deck of Playing Cards", 700, 2490, 14],
    ["Puzzle 500pc", 3200, 7990, 14],
    ["Bouncy Ball", 300, 1490, 14],
    ["Coloring Book", 900, 2990, 14],
    ["Mini Puzzle Cube", 1400, 3990, 14],
  ],
  "Pet Supplies": [
    ["Dog Food 2lb Bag", 3500, 7490, 14],
    ["Cat Litter 10lb", 3800, 7990, 14],
    ["Dog Treats", 1600, 3990, 14],
    ["Cat Food Can", 600, 1490, 14],
    ["Pet Waste Bags", 1100, 2790, 14],
  ],
};

function toBarcode(index: number): string {
  return `0${(100000000000 + index).toString().slice(-11)}`;
}

async function main() {
  // An Angolan demo store, as sign-up makes one for Angola: AOA, pt-AO
  // documents, Africa/Luanda, Regime Geral.
  const ao = countryConfig("AO")!;
  const business = await prisma.business.upsert({
    where: { id: "seed-business" },
    create: { id: "seed-business", name: "Demo Retail Co.", plan: "SIMPLE", country: ao.code, currency: ao.currency, language: ao.defaultLanguage },
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
      timezone: ao.timeZone,
      country: ao.code,
      ivaRegime: ao.defaultIvaRegime,
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
      pinHash: await hashPin(SEED_OWNER_PIN),
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
      pinHash: await hashPin(SEED_CASHIER_PIN),
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
      wage: "1850.00",
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
      unitCost: "1000.00",
      lineTotal: "24000.00",
    }));
    await prisma.purchase.create({
      data: {
        storeId: store.id,
        supplierId: suppliers[0].id,
        createdById: owner.id,
        purchaseNumber: `PO-SEED-${Date.now()}`,
        subtotal: "48000.00",
        taxTotal: "0.00",
        total: "48000.00",
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
          amount: "240000.00",
          incurredAt: new Date("2026-07-01"),
        },
        {
          storeId: store.id,
          createdById: owner.id,
          category: "UTILITIES",
          description: "Electricity & water",
          amount: "31025.00",
          incurredAt: new Date("2026-07-05"),
        },
      ],
    });
  }

  console.log("Seed complete.");
  console.log(`  Categories: ${Object.keys(CATALOG).length}, Products: ${totalProducts}`);
  console.log(`  Suppliers: ${suppliers.length}`);
  console.log(`  Owner login:   ${SEED_OWNER_EMAIL} / ${SEED_OWNER_PASSWORD} (till PIN ${SEED_OWNER_PIN})`);
  console.log(`  Cashier login: ${SEED_CASHIER_EMAIL} / ${SEED_CASHIER_PASSWORD} (till PIN ${SEED_CASHIER_PIN})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
