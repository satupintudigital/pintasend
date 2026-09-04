-- Modul WA Campaign — audiens kontak + campaign blast massal (fitur berbayar,
-- digate TenantAddon key 'campaign').
--
-- 1. Contact — audiens per tenant (chatId JID unik per tenant, tag JSON,
--    opt-out dihormati dispatcher).
-- 2. Campaign — definisi blast: template body (variabel {{nama}} dll.), media
--    opsional, filter audiens by tag, jeda acak antar pesan, jadwal, statistik.
-- 3. CampaignRecipient — unit kerja dispatcher worker
--    (workers/campaign-dispatch): snapshot chatId/nama, status per penerima.
--
-- Dispatch TIDAK berjalan di request Workers (batas eksekusi) — worker cron
-- mengambil batch pending, pola antrean sama dengan WebhookDelivery.

CREATE TABLE IF NOT EXISTS "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "chatId" TEXT NOT NULL,               -- "62812…@c.us"
    "name" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',    -- JSON array of strings
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Contact_tenantId_chatId_key" ON "Contact"("tenantId", "chatId");
CREATE INDEX IF NOT EXISTS "Contact_tenantId_optedOut_idx" ON "Contact"("tenantId", "optedOut");

CREATE TABLE IF NOT EXISTS "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "deviceId" TEXT,
    "deviceLabel" TEXT,                   -- snapshot label saat start
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft', -- draft|scheduled|running|paused|completed|failed|cancelled
    "messageBody" TEXT NOT NULL,          -- template teks; caption media
    "mediaType" TEXT,                     -- image|video|audio|document (null = text)
    "mediaUrl" TEXT,
    "filename" TEXT,
    "audienceTag" TEXT,                   -- null = semua kontak non opt-out
    "minDelaySec" INTEGER NOT NULL DEFAULT 5,
    "maxDelaySec" INTEGER NOT NULL DEFAULT 15,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failReason" TEXT,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Campaign_tenantId_status_idx" ON "Campaign"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Campaign_status_scheduledAt_idx" ON "Campaign"("status", "scheduledAt");

CREATE TABLE IF NOT EXISTS "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL REFERENCES "Campaign"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "contactId" TEXT,
    "chatId" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending', -- pending|sending|sent|failed|skipped
    "error" TEXT,
    "messageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CampaignRecipient_campaignId_status_idx"
  ON "CampaignRecipient"("campaignId", "status");
