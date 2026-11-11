#!/usr/bin/env node
// Menunggu sampai ada perubahan di remote (cabang baru atau commit baru) atau waktu habis.
//   node scripts/wait-for-change.mjs [detik=540]
// Mencetak "CHANGED" atau "TIMEOUT". Selalu exit 0. Tidak memakai token selama menunggu.
import { execFileSync } from 'node:child_process';

const limit = Math.max(30, Number(process.argv[2]) || 540);
const every = 30;
const snap = () => {
  try { return execFileSync('git', ['ls-remote', 'origin'], { encoding: 'utf8', timeout: 60000 }); }
  catch { return null; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const start = snap();
const t0 = Date.now();
while ((Date.now() - t0) / 1000 < limit) {
  await sleep(every * 1000);
  const now = snap();
  if (now !== null && start !== null && now !== start) {
    console.log('CHANGED');
    process.exit(0);
  }
}
console.log('TIMEOUT');
process.exit(0);
