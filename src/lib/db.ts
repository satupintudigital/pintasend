import { neon } from "@neondatabase/serverless";

// Lazy init — hindari error "No database connection string" saat modul
// di-import di lingkungan tanpa DATABASE_URL (mis. unit test).
type SqlFn = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
let _sql: SqlFn | null = null;
function sql(): SqlFn {
  if (!_sql) _sql = neon(process.env.DATABASE_URL as string) as unknown as SqlFn;
  return _sql;
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
  const rows = (await sql()(text, params)) as T[];
  return rows;
}

export async function queryOne<T extends object>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}
