import { Client } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL as string;

// Helper eksekusi SQL via Neon serverless driver (WebSocket, port 443).
// Dipakai di runtime (Cloudflare Workers/Node) karena workerd tidak bisa
// memuat Prisma engine native maupun WASM query engine tanpa melampaui
// batas ukuran 3 MiB. Satu koneksi singkat per query — tidak memakai
// connection pooling lintas request (tidak didukung di Workers).

export async function query<T extends object>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client(connectionString);
  await client.connect();
  try {
    const { rows } = await client.query(text, params);
    return rows as T[];
  } finally {
    await client.end();
  }
}

export async function queryOne<T extends object>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}
