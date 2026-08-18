import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest tidak otomatis membaca tsconfig paths — alias @/ wajib didefinisikan
// agar unit test bisa memuat modul src/lib yang memakai import "@/…".
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
