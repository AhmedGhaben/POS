import { PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";

/**
 * Local demo only: an accountant login with access to the seed business,
 * so the accounting section can be tried as an accountant. Safe to re-run:
 * npx ts-node prisma/demo-accountant.ts
 */
async function main() {
  const prisma = new PrismaClient();
  const business = await prisma.business.findUnique({ where: { id: "seed-business" } });
  if (!business) throw new Error("Run the seed first: the demo business is missing");
  const owner = await prisma.user.findFirstOrThrow({ where: { businessId: business.id, role: Role.OWNER } });
  const email = "accountant@demo-store.test";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      businessId: business.id,
      email,
      passwordHash: await bcrypt.hash("AccountantPass123!", 10),
      firstName: "Carla",
      lastName: "Contabilista",
      role: Role.ACCOUNTANT,
      ocpcaNumber: "OCPCA-0001",
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.accountantAccess.upsert({
    where: { userId_businessId: { userId: user.id, businessId: business.id } },
    update: { revokedAt: null },
    create: { userId: user.id, businessId: business.id, invitedById: owner.id },
  });
  console.log(`${email} / AccountantPass123! has access to ${business.name}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
