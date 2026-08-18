import "dotenv/config";
import { Client } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { uuidv7 } from "../src/lib/uuidv7";

async function main() {
  const client = new Client(process.env.DATABASE_URL as string);
  await client.connect();

  const tenantId = "00000000-0000-7000-8000-000000000001";
  const passwordHash = bcrypt.hashSync("admin123", 10);

  await client.query(
    'INSERT INTO "Tenant" (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    [tenantId, "Wavio Demo"],
  );

  await client.query(
    'INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", role) ' +
      "VALUES ($1, $2, $3, $4, $5, $6) " +
      'ON CONFLICT (email) DO NOTHING',
    [uuidv7(), tenantId, "owner@wavio.test", "Owner Wavio", passwordHash, "owner"],
  );

  // Plan (id statis agar seed idempoten).
  const plans = [
    { id: "00000000-0000-7000-8000-000000000101", name: "Espresso", tagline: "Bayar sesuai pakai", priceDisplay: "Rp 400/pesan", maxDevices: 1, maxUsers: 3, maxMessagesPerMonth: null, includesDelay: false },
    { id: "00000000-0000-7000-8000-000000000102", name: "Latte", tagline: "Paling laris", priceDisplay: "Rp 150.000/bulan", maxDevices: 3, maxUsers: 5, maxMessagesPerMonth: 500, includesDelay: false },
    { id: "00000000-0000-7000-8000-000000000103", name: "Mocha", tagline: "Unlimited", priceDisplay: "Rp 300.000/bulan", maxDevices: 10, maxUsers: 20, maxMessagesPerMonth: null, includesDelay: true },
  ];
  for (const p of plans) {
    await client.query(
      'INSERT INTO "Plan" (id, name, tagline, "priceDisplay", "maxDevices", "maxUsers", "maxMessagesPerMonth", "includesDelay") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING',
      [p.id, p.name, p.tagline, p.priceDisplay, p.maxDevices, p.maxUsers, p.maxMessagesPerMonth, p.includesDelay],
    );
  }

  // Tenant platform + platform admin.
  const platformTenantId = "00000000-0000-7000-8000-000000000002";
  await client.query(
    'INSERT INTO "Tenant" (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    [platformTenantId, "Wavio Platform"],
  );
  await client.query(
    'INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", role) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING',
    [uuidv7(), platformTenantId, "platform@wavio.test", "Platform Admin", passwordHash, "platform_admin"],
  );

  // Demo tenant diberi plan Latte.
  await client.query(
    'UPDATE "Tenant" SET "planId" = $1, "planAssignedAt" = now() WHERE id = $2',
    ["00000000-0000-7000-8000-000000000102", tenantId],
  );

  await client.end();
  console.log("Seed selesai: owner@wavio.test / admin123");
  // Catatan: D1 di-seed terpisah via wrangler (prisma/d1-seed.sql) karena
  // binding D1 hanya ada di runtime Worker. Pastikan passwordHash D1 = Neon
  // (keduanya hash bcrypt dari password yang sama → bcrypt.compare valid).
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
