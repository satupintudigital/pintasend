-- Catat reaksi pesan (webhook `message.reaction`) pada riwayat pesan.
-- Kolom `reaction` = JSON map senderId → emoji, mis. {"62812@c.us":"👍"}.
-- NULL = belum ada reaksi. Lihat src/lib/messageStore.ts.
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "reaction" TEXT;
