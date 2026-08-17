import { getCloudflareContext } from "@opennextjs/cloudflare";

// Binding di-resolve sekali per isolate (env stabil). Memakai getCloudflareContext
// — binding hanya tersedia di runtime Worker, bukan process.env.
let cachedEnv: Record<string, unknown> | null = null;

async function getEnv(): Promise<Record<string, unknown>> {
  if (cachedEnv) return cachedEnv;
  const { env } = await getCloudflareContext({ async: true });
  cachedEnv = env as Record<string, unknown>;
  return cachedEnv;
}

export async function getBinding<T>(name: string): Promise<T> {
  const env = await getEnv();
  const binding = env[name] as T | undefined;
  if (!binding) throw new Error(`Cloudflare binding "${name}" tidak tersedia`);
  return binding;
}
