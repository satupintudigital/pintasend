// Menerapkan skema ke Neon melalui @neondatabase/serverless (WebSocket/443).
// Dipakai karena port TCP 5432 (Prisma CLI) terblokir di jaringan ini, dan karena
// di Cloudflare Workers pun hanya jalur HTTPS/WebSocket yang tersedia.
import { Client } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL tidak diset");

const ddl = readFileSync(
  fileURLToPath(new URL("./wavio-schema.sql", import.meta.url)),
  "utf8",
);

const statements = ddl
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
console.log(`Selesai: ${statements.length} statement berhasil diterapkan.`);
