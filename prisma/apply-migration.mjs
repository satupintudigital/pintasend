// Menerapkan SATU file migrasi inkremental ke Neon (prisma/migrations/*.sql).
// Pola sama dengan apply-schema.mjs (@neondatabase/serverless, WebSocket 443)
// karena port TCP 5432 Prisma CLI terblokir di jaringan ini.
//
// Pemakaian: node prisma/apply-migration.mjs prisma/migrations/<file>.sql
// Statement dipisah ";" di akhir baris; komentar -- diabaikan.
import { Client } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const file = process.argv[2];
if (!file) throw new Error("Pemakaian: node prisma/apply-migration.mjs <file.sql>");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL tidak diset");

const ddl = readFileSync(fileURLToPath(new URL(`./${file.replace(/^prisma\//, "")}`, import.meta.url)), "utf8");

// Hapus komentar "-- …" (full-line & inline) dengan sadar string-literal,
// lalu pecah per ";". Tanpa ini, ";" di dalam komentar memotong statement.
function stripSqlComments(sql) {
  let out = "";
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" ) {
      // '' = escape kutip di dalam literal — tetap dalam string.
      if (inString && sql[i + 1] === "'") {
        out += "''";
        i++;
        continue;
      }
      inString = !inString;
      out += ch;
      continue;
    }
    if (!inString && ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    out += ch;
  }
  return out;
}

const statements = stripSqlComments(ddl)
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

const client = new Client(url);
await client.connect();

for (const stmt of statements) {
  await client.query(stmt);
  console.log("OK  ", stmt.split("\n")[0].slice(0, 70));
}

await client.end();
console.log(`Selesai: ${statements.length} statement dari ${file} diterapkan.`);
