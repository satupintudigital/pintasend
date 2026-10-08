// Setup E2E kirim sungguhan: device 'test' (OpenWA session ready), 2 kontak
// milik user, 1 campaign 1-pesan ke semua kontak demo tenant.
import { Client } from "@neondatabase/serverless";
import "dotenv/config";
const c = new Client(process.env.DATABASE_URL);
await c.connect();
const T = "00000000-0000-7000-8000-000000000001";

// 1. Device — pakai session OpenWA yang sudah ready.
const devId = "e2e-device-test-0001";
await c.query(
  `INSERT INTO "Device" (id, "tenantId", label, "openwaSessionId", phone, status)
   VALUES ($1, $2, 'Test E2E', 'test', '6281776753715', 'ready')
   ON CONFLICT (id) DO UPDATE SET status = 'ready', phone = '6281776753715'`,
  [devId, T],
);

// 2. Kontak penerima uji (milik user).
for (const [chatId, name] of [
  ["6282243543715@c.us", "Penerima A"],
  ["6285775562220@c.us", "Penerima B"],
]) {
  await c.query(
    `INSERT INTO "Contact" (id, "tenantId", "chatId", "name", tags) VALUES ($1, $2, $3, $4, '["uji"]')
     ON CONFLICT ("tenantId", "chatId") DO UPDATE SET "optedOut" = false`,
    ["e2e-c-" + chatId.slice(0, 13), T, chatId, name],
  );
}

// 3. Campaign draft.
const campId = "e2e-send-" + Date.now();
await c.query(
  `INSERT INTO "Campaign" (id, "tenantId", "deviceId", name, status, "messageBody",
     "minDelaySec", "maxDelaySec")
   VALUES ($1, $2, $3, 'E2E Kirim Uji', 'draft',
     'Halo {{nama}}! Ini pesan uji modul Campaign dari PintaSend.', 3, 4)`,
  [campId, T, devId],
);

// 4. Resolve audiens (snapshot) — sama seperti resolveAudience di campaigns.ts.
await c.query(
  `INSERT INTO "CampaignRecipient" (id, "campaignId", "contactId", "chatId", "name", status, "createdAt")
   SELECT gen_random_uuid()::text, $1::text, id, "chatId", "name", 'pending', now()
   FROM "Contact" WHERE "tenantId" = $2::text AND "optedOut" = false ORDER BY "createdAt" ASC`,
  [campId, T],
);
await c.query(
  `UPDATE "Campaign" SET "totalRecipients" = (SELECT COUNT(*) FROM "CampaignRecipient" WHERE "campaignId" = $1),
     "deviceId" = $2::text, "deviceLabel" = 'Test E2E' WHERE id = $1::text`,
  [campId, devId],
);

console.log(JSON.stringify({ deviceId: devId, campaignId: campId }));
await c.end();
