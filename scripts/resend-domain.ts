// Kelola domain pengirim Resend: buat domain → print records DNS (Cloudflare)
// → verifikasi. Dipakai sekali saat setup domain; SDK `resend` dipakai agar
// konsisten dengan modul email (src/lib/email.ts).
//
// Jalankan dari wavio/ (butuh RESEND_API_KEY di .env):
//   npx tsx scripts/resend-domain.ts create wavio.satupintudigital.co.id
//   npx tsx scripts/resend-domain.ts status
//   npx tsx scripts/resend-domain.ts records <domainId>
//   npx tsx scripts/resend-domain.ts verify <domainId>
import "dotenv/config";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY ?? "";
if (!apiKey) {
  console.error(
    "RESEND_API_KEY belum diset di .env — isi dulu dengan API key Resend (https://resend.com/api-keys).",
  );
  process.exit(1);
}

const resend = new Resend(apiKey);

// Region terdekat dengan mayoritas penerima (Indonesia). Opsi Resend:
// us-east-1 | eu-west-1 | sa-east-1 | ap-northeast-1.
const REGION = "ap-northeast-1";

interface DnsRecord {
  record: string;
  name: string;
  value: string;
  type: string;
  priority?: number;
  routing_policy?: string;
  status?: string;
}

function fail(e: unknown): never {
  console.error(String((e as Error)?.message ?? e));
  process.exit(1);
}

function printRecords(records: DnsRecord[], domainName: string) {
  console.log(`\nTambahkan records DNS berikut di Cloudflare (zone ${domainName}):`);
  console.log("Salin name & value apa adanya — Cloudflare otomatis menormalkan nama FQDN.\n");
  for (const r of records) {
    const extra = r.priority !== undefined ? `  priority=${r.priority}` : "";
    console.log(`  [${r.record}] ${r.type}  ${r.name}${extra}  status=${r.status ?? "?"}`);
    console.log(`           value: ${r.value}`);
  }
  console.log(
    "\nSetelah records masuk, tunggu propagasi (biasanya < 15 menit, maks 72 jam),\nlalu jalankan: npx tsx scripts/resend-domain.ts verify <domainId>",
  );
}

const [cmd, arg] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case "create": {
      if (!arg) fail("Usage: npx tsx scripts/resend-domain.ts create <domain>");
      const { data, error } = await resend.domains.create({ name: arg, region: REGION });
      if (error) fail(error.message);
      if (!data) fail("Resend tidak mengembalikan data domain");
      console.log(`Domain dibuat: ${data.name} (id=${data.id}, status=${data.status})`);
      printRecords(data.records as DnsRecord[], arg);
      break;
    }
    case "status": {
      const { data, error } = await resend.domains.list();
      if (error) fail(error.message);
      if (!data?.data?.length) {
        console.log("Belum ada domain di akun ini.");
        break;
      }
      console.log("Domain di akun:");
      for (const d of data.data) {
        console.log(`  ${d.id}  ${d.name}  status=${d.status}  region=${d.region}`);
      }
      break;
    }
    case "records": {
      if (!arg) fail("Usage: npx tsx scripts/resend-domain.ts records <domainId>");
      const { data, error } = await resend.domains.get(arg);
      if (error) fail(error.message);
      if (!data) fail("Domain tidak ditemukan");
      console.log(`Status: ${data.status}`);
      printRecords(data.records as DnsRecord[], data.name);
      break;
    }
    case "verify": {
      if (!arg) fail("Usage: npx tsx scripts/resend-domain.ts verify <domainId>");
      const { data, error } = await resend.domains.verify(arg);
      if (error) fail(error.message);
      console.log(`Verifikasi dipicu: ${JSON.stringify(data)}`);
      console.log("Cek status: npx tsx scripts/resend-domain.ts status");
      break;
    }
    default:
      fail(
        "Usage:\n" +
          "  npx tsx scripts/resend-domain.ts create <domain>\n" +
          "  npx tsx scripts/resend-domain.ts status\n" +
          "  npx tsx scripts/resend-domain.ts records <domainId>\n" +
          "  npx tsx scripts/resend-domain.ts verify <domainId>",
      );
  }
}

main().catch(fail);
