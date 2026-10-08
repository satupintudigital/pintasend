// Final E2E: hapus sisa fixture lama, buat SATU campaign bersih, resolve audiens.
import { Client } from "@neondatabase/serverless";
import "dotenv/config";
const c = new Client(process.env.DATABASE_URL);
await c.connect();
const T = "00000000-0000-7000-8000-000000000001";
const CAMP = "e2e-send-final";

await c.query('DELETE FROM "CampaignRecipient" WHERE "campaignId" LIKE \'e2e-send-%\'');
await c.query('DELETE FROM "Campaign" WHERE id LIKE \'e2e-send-%\'');

await c.query(
  `INSERT INTO "Campaign" (id, "tenantId", "deviceId", name, status, "messageBody", "minDelaySec", "maxDelaySec")
   VALUES ($1::text, $2::text, 'e2e-device-test-0001', 'E2E Kirim Uji', 'draft',
     'Halo {{nama}}! Ini pesan uji modul Campaign dari PintaSend.', 3, 4)
   ON CONFLICT (id) DO NOTHING`,
  [CAMP, T],
);
await c.query(
  `INSERT INTO "CampaignRecipient" (id, "campaignId", "contactId", "chatId", "name", status, "createdAt")
   SELECT gen_random_uuid()::text, $1::text, id, "chatId", "name", 'pending', now()
   FROM "Contact" WHERE "tenantId" = $2::text AND "optedOut" = false ORDER BY "createdAt" ASC`,
  [CAMP, T],
);
await c.query(
  `UPDATE "Campaign" SET status = 'running', "startedAt" = now(),
     "totalRecipients" = (SELECT COUNT(*) FROM "CampaignRecipient" WHERE "campaignId" = $1) WHERE id = $1`,
  [CAMP],
);
const chk = await c.query('SELECT status, "totalRecipients" FROM "Campaign" WHERE id = $1', [CAMP]);
console.log(JSON.stringify(chk.rows[0]));
await c.end();
