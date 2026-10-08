#!/usr/bin/env tsx
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set([
  '.git', 'node_modules', '.worktrees', 'vendor', 'dist', '.next', 'coverage'
]);
const EXCLUDE_FILES = new Set([
  'package-lock.json', // akan diperbarui terpisah
]);

const REPLACEMENTS = [
  // Case-sensitive patterns
  { from: 'PintaSend', to: 'PintaSend' },
  { from: 'pintasend', to: 'pintasend' },
  { from: 'PINTSEND', to: 'PINTSEND' },
  { from: 'pintasend_', to: 'pintasend_' },
  { from: 'pintasend-', to: 'pintasend-' },
  { from: 'pintasend.', to: 'pintasend.' },
  { from: '.pintasend', to: '.pintasend' },
  { from: '/pintasend/', to: '/pintasend/' },
  { from: 'pintasend_', to: 'pintasend_' },
  // Domain
  { from: 'pintasend.satupintudigital.co.id', to: 'pintasend.satupintudigital.co.id' },
  { from: 'pintasend.xolution.workers.dev', to: 'pintasend.xolution.workers.dev' },
  { from: 'pintasend.test', to: 'pintasend.test' },
  { from: 'api.pintasend.id', to: 'api.pintasend.id' },
  { from: 'pintasend.id', to: 'pintasend.id' },
  // Email
  { from: 'noreply@pintasend.satupintudigital.co.id', to: 'noreply@pintasend.satupintudigital.co.id' },
  { from: 'report@pintasend.id', to: 'report@pintasend.id' },
  { from: 'halo@pintasend.id', to: 'halo@pintasend.id' },
  { from: 'dmarcreports@pintasend.satupintudigital.co.id', to: 'dmarcreports@pintasend.satupintudigital.co.id' },
  { from: 'pintasend@satupintudigital.co.id', to: 'pintasend@satupintudigital.co.id' },
  // Headers
  { from: 'x-pintasend-signature', to: 'x-pintasend-signature' },
  { from: 'x-pintasend-event', to: 'x-pintasend-event' },
  { from: 'x-pintasend-delivery-at', to: 'x-pintasend-delivery-at' },
  { from: 'x-pintasend-idempotent-replay', to: 'x-pintasend-idempotent-replay' },
  { from: 'X-PintaSend-Signature', to: 'X-PintaSend-Signature' },
  { from: 'PintaSend-Webhook', to: 'PintaSend-Webhook' },
  { from: 'PintaSend-Webhook/1.0', to: 'PintaSend-Webhook/1.0' },
  { from: 'User-Agent: PintaSend', to: 'User-Agent: PintaSend' },
  // Names
  { from: 'PintaSend Demo', to: 'PintaSend Demo' },
  { from: 'PintaSend Platform', to: 'PintaSend Platform' },
  { from: 'Owner PintaSend', to: 'Owner PintaSend' },
  { from: 'Platform Admin', to: 'Platform Admin', skip: true }, // sedangkan tetap
  { from: 'pintasend-auth', to: 'pintasend-auth' },
  { from: 'pintasend-schema.sql', to: 'pintasend-schema.sql' },
  { from: 'pintasend message', to: 'pintasend message' },
  { from: 'pintasend_message_id', to: 'pintasend_message_id' },
  // Kata ganti
  { from: 'memakai PintaSend', to: 'memakai PintaSend' },
  { from: 'memakai pintasend', to: 'memakai pintasend' },
];

let totalFiles = 0;
let totalChanges = 0;
const changedFiles: string[] = [];

function walkDir(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.isFile()) {
      if (!EXCLUDE_FILES.has(entry.name)) {
        results.push(full);
      }
    }
  }
  return results;
}

function processFile(filePath: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let modified = false;
    let newContent = content;

    for (const { from, to, skip } of REPLACEMENTS) {
      if (skip) continue;
      // Hanya ganti jika ada
      if (content.includes(from)) {
        newContent = newContent.split(from).join(to);
        modified = true;
      }
    }

    if (modified) {
      writeFileSync(filePath, newContent, 'utf-8');
      const rel = filePath.replace(ROOT + '/', '');
      changedFiles.push(rel);
      totalFiles++;
      // Hitung perubahan
      const count = (content.match(new RegExp(Object.values(REPLACEMENTS).filter(r => !r.skip).map(r => r.from).join('|'), 'g')) || []).length;
      totalChanges += count;
    }
    return modified;
  } catch (e) {
    console.error(`Error processing ${filePath}:`, e.message);
    return false;
  }
}

// Main
const files = walkDir(ROOT);
console.log(`Memproses ${files.length} file...\n`);

for (const file of files) {
  processFile(file);
}

console.log('═'.repeat(60));
console.log(`✅ Selesai! ${totalFiles} file diubah, ~${totalChanges} perubahan`);
console.log('═'.repeat(60));
console.log('\nFile yang diubah:');
changedFiles.forEach(f => console.log(`  • ${f}`));

// Cek sisa referensi pintasend
console.log('\n' + '═'.repeat(60));
console.log('Mengecek sisa referensi "pintasend"...\n');

const remaining: { file: string; line: number; text: string }[] = [];

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (line.match(/pintasend|PintaSend|PINTSEND/)) {
        // Skip jika ada di exclusion pattern tertentu
        if (line.match(/pintasend-schema\.sql|pintasend-schema\.sql/)) return; // sudah replaced
        remaining.push({
          file: file.replace(ROOT + '/', ''),
          line: i + 1,
          text: line.trim().substring(0, 80)
        });
      }
    });
  } catch {}
}

if (remaining.length > 0) {
  console.log(`⚠️  Sisa ${remaining.length} referensi pintasend:\n`);
  // Group by file
  const grouped = new Map<string, {line: number; text: string}[]>();
  for (const r of remaining) {
    if (!grouped.has(r.file)) grouped.set(r.file, []);
    grouped.get(r.file)!.push({ line: r.line, text: r.text });
  }
  for (const [file, lines] of grouped) {
    console.log(`📄 ${file}`);
    for (const l of lines) {
      console.log(`   L${l.line}: ${l.text}`);
    }
    console.log('');
  }
} else {
  console.log('✅ Tidak ada referensi "pintasend" yang tersisa!');
}
