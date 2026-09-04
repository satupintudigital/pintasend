// Verifikasi E2E fitur OpenWA v0.22 yang baru disematkan — menjalankan KODE
// WAVIO ASLI (bukan curl) terhadap OpenWA live:
//   location/contact/poll → react → bulk (kirim + status) → history.
//
// Guna: npx tsx scripts/verify-new-features.mts <sessionUuid> [nomorTujuanUji]
// (nomorTujuanUji default = nomor device sendiri, arg ke-3 dari script lama)
import "dotenv/config";
import { openwa } from "../src/lib/openwa";
import { normalizeChatId } from "../src/lib/chat";

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Guna: npx tsx scripts/verify-new-features.mts <sessionUuid> [nomorTujuanUji]");
    process.exit(1);
  }
  const target = process.argv[3] ?? "6281776753715";
  const chatId = normalizeChatId(target);
  if (!chatId) {
    console.error("✗ Nomor tujuan tidak valid:", target);
    process.exit(1);
  }

  console.log(`Target: ${chatId} (session ${sessionId})`);

  // 1. Location
  console.log("\n[1/6] send-location ...");
  const loc = await openwa.sendLocation(sessionId, chatId, {
    latitude: -6.2088,
    longitude: 106.8456,
    description: "Uji Wavio: lokasi toko",
  });
  console.log("      ✓", JSON.stringify(loc));

  // 2. Contact
  console.log("[2/6] send-contact ...");
  const con = await openwa.sendContact(sessionId, chatId, {
    contactName: "CS Uji Wavio",
    contactNumber: "628111222333",
  });
  console.log("      ✓", JSON.stringify(con));

  // 3. Poll
  console.log("[3/6] send-poll ...");
  const poll = await openwa.sendPoll(sessionId, chatId, {
    name: "Uji Wavio: pilih yang mana?",
    options: ["Pilihan A", "Pilihan B", "Pilihan C"],
    allowMultipleAnswers: false,
  });
  console.log("      ✓", JSON.stringify(poll));

  // 4. React (reaksi ke pesan poll yang baru terkirim)
  console.log("[4/6] react ...");
  const pollMsgId = poll?.messageId ?? poll?.id ?? null;
  if (pollMsgId) {
    const react = await openwa.react(sessionId, chatId, pollMsgId, "👍");
    console.log("      ✓", JSON.stringify(react));
    // Hapus reaksi (emoji kosong = remove)
    const unreact = await openwa.react(sessionId, chatId, pollMsgId, "");
    console.log("      ✓ hapus reaksi:", JSON.stringify(unreact));
  } else {
    console.log("      dilewati (messageId poll tidak tersedia)");
  }

  // 5. Bulk (2 penerima — sama nomor agar tidak mengganggu orang lain)
  console.log("[5/6] send-bulk ...");
  const bulk = await openwa.sendBulk(sessionId, {
    messages: [
      { chatId, type: "text", content: { text: "Uji Wavio: broadcast item 1" } },
      { chatId, type: "text", content: { text: "Uji Wavio: broadcast item 2" } },
    ],
    options: { delayBetweenMessages: 1500 },
  });
  console.log("      ✓", JSON.stringify(bulk));
  const batchId = bulk.batchId;
  console.log("      → status batch:", JSON.stringify(await openwa.getBatchStatus(sessionId, batchId)));

  // 6. History (baca riwayat pesan dari DB lokal OpenWA — didukung Baileys)
  console.log("[6/6] list-messages (riwayat chat) ...");
  const history = await openwa.listMessages(sessionId, chatId, { limit: 10 });
  const msgs = history?.messages ?? [];
  console.log(`      ✓ ${msgs.length} pesan terbaca (DB lokal OpenWA).`);
  console.log("\n✅ Verifikasi E2E fitur baru selesai.");
}

main().catch((e) => {
  console.error("✗ Verifikasi gagal:", e);
  process.exit(1);
});
