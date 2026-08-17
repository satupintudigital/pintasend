import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: "00000000-0000-7000-8000-000000000001" },
    update: {},
    create: { id: "00000000-0000-7000-8000-000000000001", name: "Wavio Demo" },
  });

  const passwordHash = bcrypt.hashSync("admin123", 10);
  await prisma.user.upsert({
    where: { email: "owner@wavio.test" },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "owner@wavio.test",
      name: "Owner Wavio",
      passwordHash,
      role: "owner",
    },
  });

  console.log("Seed selesai: owner@wavio.test / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
