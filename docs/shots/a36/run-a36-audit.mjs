import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3019;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a36');

if (!fs.existsSync(SHOTS_DIR)) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(reqUrl.pathname);
  let filePath = path.join(STATIC_DIR, pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  } else if (!fs.existsSync(filePath) && fs.existsSync(path.join(filePath, 'index.html'))) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    if (pathname.includes('.') || pathname.startsWith('/_next/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } else {
      const fallback = path.join(STATIC_DIR, 'index.html');
      if (fs.existsSync(fallback)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(fallback).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    }
  }
});

async function run() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Static server running on http://localhost:${PORT}`);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '1280', width: 1280, height: 800 },
    { name: '390', width: 390, height: 844 },
  ];

  let totalErrors = 0;

  try {
    for (const vp of viewports) {
      console.log(`\n=================== Viewport: ${vp.name}px ===================`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();

      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const txt = msg.text();
          if (!txt.includes('favicon') && !txt.includes('404')) {
            errors.push(txt);
          }
        }
      });
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(`http://localhost:${PORT}/pelanggan`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);

      // Verifikasi overflow horizontal awal
      const overflowInitial = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      console.log(`[${vp.name}px] Horizontal overflow (List): ${overflowInitial ? 'ADA (GAGAL)' : 'NIHIL (LULUS)'}`);
      if (overflowInitial) {
        totalErrors++;
        console.error(`ERROR: Terdeteksi horizontal scroll pada ${vp.name}px`);
      }

      // Klik pelanggan pertama untuk membuka detail dialog
      const firstCustomerBtn = page.locator('tbody tr td button').first();
      await firstCustomerBtn.click();
      await page.waitForTimeout(600);

      const dialog = page.locator('dialog[open]');
      const isDialogOpen = await dialog.isVisible();
      console.log(`[${vp.name}px] Dialog detail terbuka: ${isDialogOpen}`);
      if (!isDialogOpen) {
        totalErrors++;
        console.error(`ERROR: Dialog detail gagal terbuka pada ${vp.name}px`);
      }

      // Verifikasi overflow saat dialog terbuka
      const overflowDialog = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      console.log(`[${vp.name}px] Horizontal overflow (Dialog): ${overflowDialog ? 'ADA (GAGAL)' : 'NIHIL (LULUS)'}`);
      if (overflowDialog) {
        totalErrors++;
        console.error(`ERROR: Terdeteksi horizontal scroll saat dialog terbuka pada ${vp.name}px`);
      }

      if (vp.name === '1440') {
        // Screenshot Tab Ringkasan
        await page.screenshot({ path: path.join(SHOTS_DIR, 'pelanggan-detail-ringkasan-1440.png'), fullPage: false });
        console.log('Tersimpan: pelanggan-detail-ringkasan-1440.png');
      }

      if (vp.name === '1280') {
        // Pindah ke tab Riwayat Transaksi
        const tabRiwayat = page.locator('dialog button[role="tab"]:has-text("Riwayat transaksi")');
        await tabRiwayat.click();
        await page.waitForTimeout(500);

        await page.screenshot({ path: path.join(SHOTS_DIR, 'pelanggan-detail-riwayat-1280.png'), fullPage: false });
        console.log('Tersimpan: pelanggan-detail-riwayat-1280.png');

        // Klik salah satu pesanan untuk membuka ringkasan pesanan baca-saja jika ada
        const firstOrderRow = page.locator('table[aria-label="Daftar transaksi pelanggan"] tbody tr').first();
        if (await firstOrderRow.isVisible()) {
          await firstOrderRow.click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: path.join(SHOTS_DIR, 'pelanggan-detail-order-summary-1280.png'), fullPage: false });
          console.log('Tersimpan: pelanggan-detail-order-summary-1280.png');

          // Tutup ringkasan
          const backBtn = page.locator('button:has-text("Kembali ke daftar")');
          if (await backBtn.isVisible()) {
            await backBtn.click();
            await page.waitForTimeout(300);
          }
        }
      }

      if (vp.name === '390') {
        // Tab Riwayat Transaksi di Mobile
        const tabRiwayat = page.locator('dialog button[role="tab"]:has-text("Riwayat transaksi")');
        await tabRiwayat.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SHOTS_DIR, 'pelanggan-detail-riwayat-390.png'), fullPage: false });
        console.log('Tersimpan: pelanggan-detail-riwayat-390.png');

        // Tab Poin di Mobile
        const tabPoin = page.locator('dialog button[role="tab"]:has-text("Poin")');
        await tabPoin.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SHOTS_DIR, 'pelanggan-detail-poin-390.png'), fullPage: false });
        console.log('Tersimpan: pelanggan-detail-poin-390.png');

        // Verifikasi penutupan dengan tombol Tutup
        const closeBtn = page.locator('dialog button:has-text("Tutup")').last();
        await closeBtn.click();
        await page.waitForTimeout(400);
      }

      if (errors.length > 0) {
        console.error(`[${vp.name}px] Console errors:`, errors);
        totalErrors += errors.length;
      } else {
        console.log(`[${vp.name}px] Console errors: NIHIL (LULUS)`);
      }

      await context.close();
    }

    if (totalErrors > 0) {
      console.error(`\nAudit selesai dengan ${totalErrors} galat.`);
      process.exit(1);
    } else {
      console.log('\nAudit A36 LULUS SEMPURNA! Tanpa overflow horizontal dan tanpa galat konsol.');
    }
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
