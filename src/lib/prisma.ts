import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Driver adapter Neon dipakai (bukan Prisma engine binary) agar klien jalan di
// Cloudflare Workers — workerd tidak bisa memuat Prisma engine native.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL as string }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
