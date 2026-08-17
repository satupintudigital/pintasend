import { Client } from "@neondatabase/serverless";
import "dotenv/config";

const c = new Client(process.env.DATABASE_URL);
await c.connect();

const rows = await c.query('SELECT id, "openwaSessionId", label FROM "Device" WHERE label LIKE $1', [
  "Browser Test%",
]);
console.log("found devices:", JSON.stringify(rows.rows));

for (const r of rows.rows) {
  const key = process.env.OPENWA_ADMIN_KEY ?? "";
  const base = process.env.OPENWA_BASE_URL ?? "";
  try {
    await fetch(`${base}/api/sessions/${r.openwaSessionId}`, {
      method: "DELETE",
      headers: { "X-API-Key": key },
    });
    console.log("openwa session deleted:", r.openwaSessionId);
  } catch (e) {
    console.log("openwa delete failed:", String((e as Error).message));
  }
  await c.query('DELETE FROM "Device" WHERE id = $1', [r.id]);
  console.log("db row deleted:", r.id);
}

await c.end();
