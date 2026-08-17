import "dotenv/config";
import { Client } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { uuidv7 } from "../src/lib/uuidv7";

async function main() {
  const client = new Client(process.env.DATABASE_URL as string);
  await client.connect();

  const tenantId = "00000000-0000-7000-8000-000000000001";
  const passwordHash = bcrypt.hashSync("admin123", 10);

  await client.query(
    'INSERT INTO "Tenant" (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    [tenantId, "Wavio Demo"],
  );

  await client.query(
    'INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", role) ' +
      "VALUES ($1, $2, $3, $4, $5, $6) " +
      'ON CONFLICT (email) DO NOTHING',
    [uuidv7(), tenantId, "owner@wavio.test", "Owner Wavio", passwordHash, "owner"],
  );

  await client.end();
  console.log("Seed selesai: owner@wavio.test / admin123");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
