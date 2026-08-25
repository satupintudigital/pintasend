import { neon } from "@neondatabase/serverless";

// Lazy init — hindari error "No database connection string" saat modul
// di-import di lingkungan tanpa DATABASE_URL (mis. unit test).
type SqlClient = {
  query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
};
let _client: SqlClient | null = null;
function sql(): SqlClient {
  if (!_client) _client = neon(process.env.DATABASE_URL as string) as unknown as SqlClient;
  return _client;
}

// Helper eksekusi SQL via Neon serverless driver mode HTTP (fetch, port 443).
// Dipakai di runtime (Cloudflare Workers/Node) karena workerd tidak bisa
// memuat Prisma engine native maupun WASM query engine tanpa melampaui
// batas ukuran 3 MiB. Mode HTTP dipilih atas WebSocket: stateless per query,
// tanpa socket panjang yang bisa memicu "Network connection lost"
// (unhandledRejection) saat koneksi WS terputus di workerd.

export async function query<T extends object>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const rows = (await sql().query(text, params)) as T[];
  return rows;
}

export async function queryOne<T extends object>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}
