import "dotenv/config";
import { Client } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { uuidv7 } from "../src/lib/uuidv7";

async function main() {
  const client = new Client(process.env.DATABASE_URL as string);
  await client.connect();

  const tenantId = "00000000-0000-7000-8000-000000000001";

  // Password superadmin + demo (digunakan untuk semua akun seed)
  const superadminPasswordHash = bcrypt.hashSync("admin123", 10);
  const demoPasswordHash = bcrypt.hashSync("demo123", 10);

  await client.query(
    'INSERT INTO "Tenant" (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    [tenantId, "PintaSend Demo"],
  );

  // ─── Owner / Demo Tenant ──────────────────────────────────────────────────
  await client.query(
    'INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", role) ' +
      "VALUES ($1, $2, $3, $4, $5, $6) " +
      'ON CONFLICT (email) DO NOTHING',
    [uuidv7(), tenantId, "owner@pintasend.test", "Owner PintaSend", superadminPasswordHash, "owner"],
  );

  // ─── Demo Account (untuk pengujian) ──────────────────────────────────────
  await client.query(
    'INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", role) ' +
      "VALUES ($1, $2, $3, $4, $5, $6) " +
      'ON CONFLICT (email) DO NOTHING',
    [uuidv7(), tenantId, "demo@pintasend.test", "Demo User", demoPasswordHash, "member"],
  );

  // Plan (id statis agar seed idempoten). Espresso = prepaid (per pesan).
  const plans = [
    { id: "00000000-0000-7000-8000-000000000101", name: "Espresso", tagline: "Bayar sesuai pakai", priceDisplay: "Rp 400/pesan", kind: "prepaid", isPublic: true, sortOrder: 0, maxDevices: 1, maxUsers: 3, maxMessagesPerMonth: null, includesDelay: false },
    { id: "00000000-0000-7000-8000-000000000102", name: "Latte", tagline: "Paling laris", priceDisplay: "Rp 150.000/bulan", kind: "subscription", isPublic: true, sortOrder: 1, maxDevices: 3, maxUsers: 5, maxMessagesPerMonth: 500, includesDelay: false },
    { id: "00000000-0000-7000-8000-000000000103", name: "Mocha", tagline: "Unlimited", priceDisplay: "Rp 300.000/bulan", kind: "subscription", isPublic: true, sortOrder: 2, maxDevices: 10, maxUsers: 20, maxMessagesPerMonth: null, includesDelay: true },
  ];
  for (const p of plans) {
    await client.query(
      'INSERT INTO "Plan" (id, name, tagline, "priceDisplay", kind, "isPublic", "sortOrder", "maxDevices", "maxUsers", "maxMessagesPerMonth", "includesDelay") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING',
      [p.id, p.name, p.tagline, p.priceDisplay, p.kind, p.isPublic, p.sortOrder, p.maxDevices, p.maxUsers, p.maxMessagesPerMonth, p.includesDelay],
    );
  }

  // Katalog addon berbayar / grant manual (id statis, ON CONFLICT id DO NOTHING).
  const addons = [
    { id: "10000000-0000-7000-8000-000000000001", key: "random_delay", name: "Random delay", tagline: "Jeda acak 3–10 dtk antar kirim (anti-spam).", priceMonthly: 25000 },
    { id: "10000000-0000-7000-8000-000000000002", key: "remove_watermark", name: "Remove watermark", tagline: "Hapus footnote iklan dari pesan keluar tenant.", priceMonthly: null },
    { id: "10000000-0000-7000-8000-000000000003", key: "campaign", name: "Campaign", tagline: "Modul blast massal WA Campaign.", priceMonthly: null },
  ];
  for (const a of addons) {
    await client.query(
      'INSERT INTO "Addon" (id, key, name, tagline, "priceMonthly", "isActive") VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT (id) DO NOTHING',
      [a.id, a.key, a.name, a.tagline, a.priceMonthly],
    );
  }

  // Tenant platform + platform admin.
  const platformTenantId = "00000000-0000-7000-8000-000000000002";
  await client.query(
    'INSERT INTO "Tenant" (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    [platformTenantId, "PintaSend Platform"],
  );
  await client.query(
    'INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", role) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING',
    [uuidv7(), platformTenantId, "platform@pintasend.test", "Platform Admin", superadminPasswordHash, "platform_admin"],
  );

  // Demo tenant diberi plan Latte.
  await client.query(
    'UPDATE "Tenant" SET "planId" = $1, "planAssignedAt" = now() WHERE id = $2',
    ["00000000-0000-7000-8000-000000000102", tenantId],
  );

  await client.end();
  console.log("Seed selesai:");
  console.log("  Superadmin (platform): platform@pintasend.test / admin123");
  console.log("  Owner/Demo tenant:    owner@pintasend.test / admin123");
  console.log("  Demo user:            demo@pintasend.test / demo123");
  // Catatan: D1 di-seed terpisah via wrangler (prisma/d1-seed.sql) karena
  // binding D1 hanya ada di runtime Worker. Pastikan passwordHash D1 = Neon
  // (keduanya hash bcrypt dari password yang sama → bcrypt.compare valid).
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
