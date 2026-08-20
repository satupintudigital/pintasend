-- Pembatasan akun WhatsApp (webhook `session.restriction`).
-- Kolom `restriction` = JSON { kind, code, expiresAt }; NULL = tidak ada.
-- kind: reachout_timelock | tos_block | proxy_block.
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "restriction" TEXT;
