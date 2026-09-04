// Verifikasi state campaign E2E (read-only) atau flip ke running (arg: run).
import { Client } from "@neondatabase/serverless";
import "dotenv/config";
const c = new Client(process.env.DATABASE_URL);
await c.connect();
if (process.argv[2] === "run") {
  await c.query(`UPDATE "CampaignRecipient" SET status = 'pending', error = NULL, "messageId" = NULL, "sentAt" = NULL WHERE "campaignId" = 'e2e-send-final'`);
  await c.query(`UPDATE "Campaign" SET status = 'running', "startedAt" = now(), "completedAt" = NULL, "failReason" = NULL,
    "sentCount" = 0, "failedCount" = 0, "skippedCount" = 0 WHERE id = 'e2e-send-final'`);
  console.log("reset+running ok");
} else {
  const camp = await c.query('SELECT status, "totalRecipients", "sentCount", "failedCount", "skippedCount", "completedAt" FROM "Campaign" WHERE id = \'e2e-send-final\'');
  const rec = await c.query('SELECT "chatId", status, error, "messageId" FROM "CampaignRecipient" WHERE "campaignId" = \'e2e-send-final\'');
  console.log(JSON.stringify({ campaign: camp.rows[0], recipients: rec.rows }, null, 1));
}
await c.end();
