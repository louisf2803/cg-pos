import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(
  'file:///C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
);

const OUT_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a58');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/x-component; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function resolveFile(reqUrl) {
  const clean = decodeURIComponent((reqUrl || '/').split('?')[0]);
  const rel = clean.replace(/^\/+/, '');
  const candidates = [
    path.join(OUT_DIR, rel),
    path.join(OUT_DIR, rel, 'index.html'),
    path.join(OUT_DIR, `${rel}.html`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const server = http.createServer((req, res) => {
  if ((req.url || '').split('?')[0] === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  const filePath = resolveFile(req.url);
  if (!filePath) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const BASE = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});

const consoleErrors = [];
const pageErrors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
  });

  async function assertNoOverflow(label) {
    const res = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    if (res.sw > res.iw + 1) {
      throw new Error(`Overflow horizontal di ${label}: scrollWidth=${res.sw} > innerWidth=${res.iw}`);
    }
  }

  // 1. /fasilitas — uji keadaan kosong, tambah fasilitas nama panjang, ubah & toggle status
  await page.goto(`${BASE}/fasilitas`, { waitUntil: 'networkidle' });
  await page.getByText('Belum ada produk fasilitas.').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /Tambah fasilitas pertama/i }).click();
  await page.locator('#fas-nama').fill('Ruang VIP Panorama Lantai 2 (AC + Proyektor + Layar Lebar)');
  await page.locator('#fas-harga').fill('150000');
  await page.getByRole('radio', { name: 'Per sesi' }).click();
  await page.locator('#fas-kapasitas').fill('12');
  await page.locator('#fas-sku').fill('FAS-VIP02');
  await page.locator('#fas-catatan').fill('Termasuk Smart TV, AC ganda, dan papan tulis');
  await page.getByRole('button', { name: 'Simpan fasilitas' }).click();
  await page.getByText('Ruang VIP Panorama Lantai 2 (AC + Proyektor + Layar Lebar)').first().waitFor({ timeout: 10000 });

  for (const [w, h] of [[1440, 900], [1280, 800], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    await assertNoOverflow(`fasilitas-${w}`);
    await page.screenshot({ path: path.join(SHOTS_DIR, `a58-fasilitas-${w}.png`) });
  }

  // 2. /laporan/fasilitas (klik tautan SPA agar fasilitas baru tetap terbawa di sesi fake)
  await page.getByRole('link', { name: /Laporan pemakaian/i }).click();
  await page.getByText('Laporan fasilitas').first().waitFor({ timeout: 10000 });
  await page.getByText(/Belum ada pemakaian fasilitas pada periode ini/i).waitFor({ timeout: 10000 });
  for (const [w, h] of [[1440, 900], [1280, 800], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    await assertNoOverflow(`laporan-fasilitas-${w}`);
    if (w === 1280 || w === 390) {
      await page.screenshot({ path: path.join(SHOTS_DIR, `a58-laporan-fasilitas-${w}.png`) });
    }
  }

  // 3. /loyalty — Tab Aturan Poin, Grup Loyalty, & Ulang Tahun
  await page.goto(`${BASE}/loyalty`, { waitUntil: 'networkidle' });
  await page.getByTestId('contoh-loyalti').waitFor({ timeout: 10000 });

  await page.getByRole('tab', { name: 'Grup Loyalty' }).click();
  await page.getByText('Perunggu').first().waitFor({ timeout: 10000 });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(200);
  await assertNoOverflow('loyalty-grup-1280');
  await page.screenshot({ path: path.join(SHOTS_DIR, 'a58-loyalty-grup-1280.png') });

  await page.getByRole('tab', { name: 'Ulang Tahun' }).click();
  await page.getByText('Kak Dewi').first().waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /Berikan \+50 poin/i }).first().click();
  await page.getByText(/poin berhasil ditambahkan ke Kak Dewi/i).waitFor({ timeout: 10000 });

  for (const [w, h] of [[1440, 900], [1280, 800], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    await assertNoOverflow(`loyalty-ulang-tahun-${w}`);
    if (w === 1280 || w === 390) {
      await page.screenshot({ path: path.join(SHOTS_DIR, `a58-loyalty-ulang-tahun-${w}.png`) });
    }
  }

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(`Console/Page errors ditemukan:\nConsole: ${consoleErrors.join('; ')}\nPage: ${pageErrors.join('; ')}`);
  }

  console.log('AUDIT A58 LULUS');
} finally {
  await browser.close();
  server.close();
}

