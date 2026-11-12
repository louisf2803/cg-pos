#!/usr/bin/env node
// Cek apakah "Gelombang A" CG POS sudah selesai. Tanpa dependensi.
//   node scripts/goal-check.mjs            -> ringkasan + GOAL MET / GOAL NOT MET
//   node scripts/goal-check.mjs --list     -> tambah daftar fitur Gelombang A yang belum yes (maks 40)
//   node scripts/goal-check.mjs --semi     -> SEMI GOAL (keputusan Louis 13 Nov 2026): fitur dihitung ada bila clone = yes ATAU docs/semi.csv
//                                             mencatat status 'ada' (kode ada dan kira-kira bisa dipakai); TANPA syarat screenshot.
//                                             Bukti Playwright dan pencocokan alur Majoo menyusul setelah semua fitur ada.
// Aturan:
//   - Fitur Gelombang A (docs/wave.csv, kolom wave = A) selesai bila kolom clone di docs/features.csv = yes.
//   - Tiap fitur yang selesai wajib punya bukti: kolom evidence di docs/wave.csv berisi satu atau lebih
//     folder (pisahkan dengan |) yang ada dan berisi minimal 2 gambar (png/jpg/jpeg/webp), mis. 390 px dan 1280 px.
//   - Tidak boleh ada bug S1/S2 terbuka di docs/bugs.md (baris "- [ ] S1 ..." atau "- [ ] S2 ...").
// Exit code 0 hanya jika GOAL MET.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const list = process.argv.includes('--list');
const semi = process.argv.includes('--semi');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.some((x) => x.trim() !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) { console.log(`GOAL NOT MET (berkas tidak ada: ${rel})`); process.exit(1); }
  return readFileSync(p, 'utf8');
}
function countImages(dir) {
  const p = join(root, dir);
  if (!existsSync(p) || !statSync(p).isDirectory()) return 0;
  let n = 0;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (e.isDirectory()) n += countImages(join(dir, e.name));
    else if (/\.(png|jpe?g|webp)$/i.test(e.name)) n++;
  }
  return n;
}

const features = parseCsv(read('docs/features.csv'));
const waves = parseCsv(read('docs/wave.csv'));
const clone = new Map(features.map((f) => [f.feature, f.clone]));

let total = 0, done = 0, partial = 0, no = 0, noEvidence = 0, orphan = 0;
const todo = [], missing = [];
for (const w of waves) {
  if (w.wave !== 'A') continue;
  total++;
  if (!clone.has(w.feature)) { orphan++; todo.push(`[tak ada di features.csv] ${w.feature}`); continue; }
  const st = clone.get(w.feature);
  if (st === 'yes') {
    done++;
    const dirs = (w.evidence || '').split('|').map((x) => x.trim()).filter(Boolean);
    const imgs = dirs.reduce((a, d) => a + countImages(d), 0);
    if (imgs < 2) { noEvidence++; missing.push(w.feature); }
  } else {
    if (st === 'partial') partial++; else no++;
    todo.push(`[${st}] ${w.feature}`);
  }
}

let openBugs = 0;
if (existsSync(join(root, 'docs/bugs.md'))) {
  let fenced = false;
  for (const line of readFileSync(join(root, 'docs/bugs.md'), 'utf8').split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (!fenced && /^\s*-\s*\[\s\]\s*S[12]\b/.test(line)) openBugs++;
  }
}

console.log(`Gelombang A: ${done}/${total} done | belum: partial ${partial}, no ${no}${orphan ? `, tak terpetakan ${orphan}` : ''} | bukti kurang: ${noEvidence} | bug S1/S2 terbuka: ${openBugs}`);
if (list) {
  todo.slice(0, 40).forEach((t) => console.log('  ' + t));
  if (todo.length > 40) console.log(`  ... +${todo.length - 40} lagi`);
  missing.slice(0, 20).forEach((t) => console.log('  [bukti kurang] ' + t));
}

if (semi) {
  const semiRows = existsSync(join(root, 'docs/semi.csv')) ? parseCsv(readFileSync(join(root, 'docs/semi.csv'), 'utf8')) : [];
  const semiStatus = new Map(semiRows.map((r) => [r.feature, r.status]));
  let sDone = 0, sPart = 0, sNone = 0; const sTodo = [];
  for (const w of waves) {
    if (w.wave !== 'A') continue;
    const st = semiStatus.get(w.feature);
    if (clone.get(w.feature) === 'yes' || st === 'ada') sDone++;
    else { if (st === 'sebagian') sPart++; else sNone++; sTodo.push('[' + (st || 'belum dinilai') + '] ' + w.feature); }
  }
  console.log('SEMI Gelombang A: ' + sDone + '/' + total + ' ada di kode | sebagian ' + sPart + ', belum ' + sNone + ' | bug S1/S2 terbuka: ' + openBugs);
  if (list) sTodo.slice(0, 60).forEach((x) => console.log('  ' + x));
  const sMet = total > 0 && sDone === total && openBugs === 0 && orphan === 0;
  console.log(sMet ? 'SEMI MET' : 'SEMI NOT MET');
  process.exit(sMet ? 0 : 1);
}
const met = total > 0 && done === total && noEvidence === 0 && openBugs === 0 && orphan === 0;
console.log(met ? 'GOAL MET' : 'GOAL NOT MET');
process.exit(met ? 0 : 1);
