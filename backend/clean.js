/**
 * clean.js — Maintenance & Cache Cleaner
 * Usage:
 *   node clean.js          → tampilkan menu
 *   node clean.js cache    → hapus .wwebjs_cache
 *   node clean.js session  → hapus session (paksa QR ulang)
 *   node clean.js hasil    → hapus file output di folder hasil/
 *   node clean.js all      → bersihkan semua
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');

const TARGETS = {
  cache: {
    label: 'WA Browser Cache (.wwebjs_cache)',
    paths: ['.wwebjs_cache'],
    type: 'dir',
  },
  session: {
    label: 'WA Session (paksa scan QR ulang)',
    paths: ['_IGNORE_session', '_IGNORE_cek-wa', '_IGNORE_ulang-qr', 'session.data.json', 'cek-wa.data.json'],
    type: 'mixed',
  },
  hasil: {
    label: 'File output (folder hasil/ & hasil.json/xlsx/txt)',
    paths: ['hasil', 'hasil.json', 'hasil.xlsx', 'hasil.txt'],
    type: 'mixed',
  },
};

function remove(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) { console.log(`  ⏭  Tidak ada: ${relPath}`); return; }
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`  ✅ Dihapus folder: ${relPath}`);
  } else {
    fs.unlinkSync(fullPath);
    console.log(`  ✅ Dihapus file:   ${relPath}`);
  }
}

function runClean(key) {
  const t = TARGETS[key];
  if (!t) { console.log('Target tidak dikenal:', key); return; }
  console.log(`\n🧹 Membersihkan: ${t.label}`);
  t.paths.forEach(remove);
}

async function interactiveMenu() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));

  console.log('\n╔══════════════════════════════════╗');
  console.log('║  WA-CHIPER Maintenance Cleaner  ║');
  console.log('╚══════════════════════════════════╝\n');
  console.log('Pilih aksi:');
  console.log('  [1] Bersihkan WA Browser Cache (.wwebjs_cache)');
  console.log('  [2] Reset Session WA (paksa scan QR ulang)');
  console.log('  [3] Hapus file output (hasil/)');
  console.log('  [4] Bersihkan SEMUA');
  console.log('  [q] Keluar\n');

  const answer = await ask('Pilihan: ');
  rl.close();

  switch (answer.trim()) {
    case '1': runClean('cache'); break;
    case '2': runClean('session'); break;
    case '3': runClean('hasil'); break;
    case '4':
      ['cache', 'session', 'hasil'].forEach(runClean);
      break;
    case 'q': console.log('Dibatalkan.'); break;
    default: console.log('Pilihan tidak valid.');
  }
  console.log('\nSelesai.\n');
}
const arg = process.argv[2];
if (arg) {
  if (arg === 'all') {
    ['cache', 'session', 'hasil'].forEach(runClean);
  } else {
    runClean(arg);
  }
  console.log('\nSelesai.\n');
} else {
  interactiveMenu();
}
