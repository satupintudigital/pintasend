// Reset campaign E2E final: penerima → pending, campaign → running.
import { Client } from "@neondatabase/serverless";
import "dotenv/config";
const c = new Client(process.env.DATABASE_URL);
await c.connect();
await c.query(`UPDATE "CampaignRecipient" SET status = 'pending', error = NULL, "messageId" = NULL, "sentAt" = NULL WHERE "campaignId" = 'e2e-send-final'`);
await c.query(`UPDATE "Campaign" SET status = 'running', "startedAt" = now(), "completedAt" = NULL, "failReason" = NULL,
  "sentCount" = 0, "failedCount" = 0, "skippedCount" = 0 WHERE id = 'e2e-send-final'`);
console.log("reset ok");
await c.end();
