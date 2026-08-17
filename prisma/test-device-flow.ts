import "dotenv/config";
import { openwa } from "../src/lib/openwa";
import { query } from "../src/lib/db";
import { uuidv7 } from "../src/lib/uuidv7";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const deviceId = uuidv7();
  const sessionName = `wavio-test-${deviceId.replace(/-/g, "").slice(0, 10)}`;
  const tenantId = "00000000-0000-7000-8000-000000000001";
  let owaId: string | undefined;

  try {
    // 1. Buat session di OpenWA
    const owa = await openwa.createSession(sessionName);
    owaId = owa.id;
    console.log("1. session created:", owaId, "| status:", owa.status);

    // 2. Insert baris Device (id uuidv7)
    await query(
      'INSERT INTO "Device" (id, "tenantId", label, "openwaSessionId", status) VALUES ($1, $2, $3, $4, $5)',
      [deviceId, tenantId, "Test Flow", owaId, owa.status],
    );
    console.log("2. device row inserted:", deviceId, "(uuidv7:", deviceId[14] === "7" ? "ya" : "tidak", ")");

    // 3. Start session
    const started = await openwa.startSession(owaId);
    console.log("3. started:", started.status);

    // 4. Poll sampai qr_ready (maks ~15 detik) — sama seperti flow UI
    let qrStatus = started.status;
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const s = await openwa.getSession(owaId);
      qrStatus = s.status;
      console.log(`   poll ${i + 1}: ${qrStatus}`);
      if (qrStatus === "qr_ready") break;
    }
    if (qrStatus !== "qr_ready") throw new Error(`QR tidak siap (status: ${qrStatus})`);

    // 5. Ambil QR
    const qr = await openwa.getQr(owaId);
    console.log("4. qr status:", qr.status, "| qrCode prefix:", qr.qrCode.slice(0, 40), "…");
    console.log("   QR OK, panjang:", qr.qrCode.length);
  } finally {
    // 6. Cleanup: hapus session OpenWA + baris DB
    if (owaId) {
      try {
        await openwa.deleteSession(owaId);
        console.log("5. cleanup: session OpenWA dihapus");
      } catch (e) {
        console.log("5. cleanup: gagal hapus session (best effort) —", (e as Error).message.slice(0, 80));
      }
    }
    await query('DELETE FROM "Device" WHERE id = $1', [deviceId]).catch(() => {});
    console.log("   cleanup: baris DB dihapus");
  }
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
