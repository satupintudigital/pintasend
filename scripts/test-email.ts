// Tes kirim email pertama via Resend (hello world) — verifikasi API key.
// Jalankan: npx tsx scripts/test-email.ts
import "dotenv/config";
import { sendEmail } from "../src/lib/email";

async function main() {
  const { id } = await sendEmail({
    from: "Wavio <noreply@wavio.satupintudigital.co.id>",
    to: "wavio@satupintudigital.co.id",
    subject: "Hello World",
    html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
  });
  console.log(`Email terkirim! id=${id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
