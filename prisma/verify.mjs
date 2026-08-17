import { Client } from "@neondatabase/serverless";
import "dotenv/config";

const c = new Client(process.env.DATABASE_URL);
await c.connect();
const tables = await c.query(
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
);
console.log("TABLES:", tables.rows.map((r) => r.tablename).join(", "));
const users = await c.query('SELECT email, role FROM "User"');
console.log("USERS:", JSON.stringify(users.rows));
await c.end();
