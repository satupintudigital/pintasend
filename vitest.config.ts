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
  test: {
    // Worktree git (git worktree) berisi checkout lain dari repo yang sama —
    // menjalankannya dari root akan mencampur dua pohon kode dalam satu proses
    // (alias @/ resolve ke src root), membuat test hijau tampak gagal. Full
    // suite sebuah checkout harus dijalankan dari direktori checkout itu sendiri.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.worktrees/**",
      "**/coverage/**",
    ],
  },
});
