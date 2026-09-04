// Verifikasi E2E seed template — menjalankan KODE WAVIO ASLI (bukan curl)
// terhadap OpenWA live: seedTemplatesForSession → listTemplates → sendTemplate.
//
// Catatan: endpoint templates OpenWA menerima sessionId berupa UUID (bukan nama
// session) — Wavio menyimpan UUID di Device.openwaSessionId, jadi di produksi
// selalu UUID. Script ini menerima UUID session.
//
// Guna: npx tsx scripts/verify-seed.mts <sessionUuid> [nomorTujuanUji]
import "dotenv/config";
import { seedTemplatesForSession, NALA_TEMPLATES } from "../src/lib/templates";
import { openwa } from "../src/lib/openwa";
import { normalizeChatId } from "../src/lib/chat";

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Guna: npx tsx scripts/verify-seed.mts <sessionUuid> [nomorTujuanUji]");
    process.exit(1);
  }

  console.log(`[1/4] Seed ${NALA_TEMPLATES.length} template ke session ${sessionId}...`);
  await seedTemplatesForSession(sessionId);
  console.log("      seed selesai (idempoten).");

  console.log("[2/4] List templates via openwa.listTemplates...");
  const templates = await openwa.listTemplates(sessionId);
  console.log(`      ${templates.length} template terdaftar:`, templates.map((t) => t.name).join(", "));
  if (templates.length !== NALA_TEMPLATES.length) {
    console.error("      ✗ JUMLAH template tidak sesuai katalog!");
    process.exit(1);
  }
  const missing = NALA_TEMPLATES.filter((t) => !templates.some((x) => x.name === t.name));
  if (missing.length) {
    console.error("      ✗ Template hilang:", missing.map((m) => m.name).join(", "));
    process.exit(1);
  }
  console.log("      ✓ Semua template ada.");

  // Verifikasi placeholder ter-parse sama di kedua sisi (server vs lib Wavio).
  console.log("[3/4] Bandingkan body template server vs katalog Wavio...");
  for (const t of NALA_TEMPLATES) {
    const server = templates.find((x) => x.name === t.name);
    if (!server || server.body !== t.body) {
      console.error(`      ✗ body "${t.name}" berbeda server vs Wavio.`);
      process.exit(1);
    }
  }
  console.log("      ✓ Body template identik.");

  console.log("[4/4] Kirim template uji (opsional — arg ke-3)...");
  const target = process.argv[3];
  if (target) {
    const chatId = normalizeChatId(target);
    if (!chatId) {
      console.error("      ✗ Nomor tujuan tidak valid:", target);
      process.exit(1);
    }
    const res = await openwa.sendTemplate(sessionId, chatId, {
      templateName: "sapaan_pelanggan",
    });
    console.log("      ✓ sendTemplate OK:", JSON.stringify(res));
  } else {
    console.log("      dilewati (berikan nomor tujuan sebagai arg ke-3 untuk uji kirim).");
  }

  console.log("\n✅ Verifikasi seed selesai.");
}

main().catch((e) => {
  console.error("✗ Verifikasi gagal:", e);
  process.exit(1);
});
