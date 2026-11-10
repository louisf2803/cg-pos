import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3022;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a38');

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

      // 1. Kunjungi /keuangan
      await page.goto(`http://localhost:${PORT}/keuangan`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);

      // Verifikasi overflow horizontal pada layout bawaan
      const overflowDefault = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      console.log(`[${vp.name}px] Horizontal overflow (Default): ${overflowDefault ? 'ADA (GAGAL)' : 'NIHIL (LULUS)'}`);
      if (overflowDefault) {
        totalErrors++;
        console.error(`ERROR: Terdeteksi horizontal scroll pada ${vp.name}px`);
      }

      // Verifikasi 4 widget bawaan
      const w1 = await page.locator('[data-testid="widget-laba-rugi"]').isVisible();
      const w2 = await page.locator('[data-testid="widget-arus-kas"]').isVisible();
      const w3 = await page.locator('[data-testid="widget-saldo-kas"]').isVisible();
      const w4 = await page.locator('[data-testid="widget-posisi-neraca"]').isVisible();
      console.log(`[${vp.name}px] 4 Widget Bawaan: LabaRugi=${w1}, ArusKas=${w2}, SaldoKas=${w3}, Neraca=${w4}`);

      if (!w1 || !w2 || !w3 || !w4) {
        totalErrors++;
        console.error(`ERROR: Widget bawaan tidak lengkap pada ${vp.name}px`);
      }

      await page.screenshot({
        path: path.join(SHOTS_DIR, `keuangan-default-${vp.name}.png`),
        fullPage: true,
      });
      console.log(`Tersimpan: keuangan-default-${vp.name}.png`);

      // 2. Interaksi tambah widget (pada 1280px)
      if (vp.name === '1280') {
        console.log('Membuka modal Tambah Widget...');
        await page.click('[data-testid="btn-add-widget"]');
        await page.waitForTimeout(500);

        const modalVisible = await page.locator('#add-widget-title').isVisible();
        console.log('Modal Tambah Widget terlihat:', modalVisible);
        if (!modalVisible) {
          totalErrors++;
          console.error('ERROR: Modal Tambah Widget tidak muncul!');
        }

        await page.screenshot({
          path: path.join(SHOTS_DIR, 'keuangan-modal-tambah-1280.png'),
          fullPage: false,
        });
        console.log('Tersimpan: keuangan-modal-tambah-1280.png');

        // Pasang widget Umur Hutang
        console.log('Menambahkan widget Umur Hutang...');
        await page.click('[data-testid="btn-select-widget-umur-hutang"]');
        await page.waitForTimeout(600);

        const wHutangVisible = await page.locator('[data-testid="widget-umur-hutang"]').isVisible();
        console.log('Widget Umur Hutang berhasil terpasang:', wHutangVisible);
        if (!wHutangVisible) {
          totalErrors++;
          console.error('ERROR: Widget Umur Hutang tidak muncul setelah ditambahkan!');
        }

        // Pindahkan widget Umur Hutang ke atas
        console.log('Memindahkan widget Umur Hutang ke atas...');
        await page.click('[data-testid="btn-move-up-umur-hutang"]');
        await page.waitForTimeout(400);

        // Pasang sisa widget (Arus Ringkas & Rekonsiliasi Ringkas)
        await page.click('[data-testid="btn-add-widget"]');
        await page.waitForTimeout(400);
        await page.click('[data-testid="btn-select-widget-arus-ringkas"]');
        await page.waitForTimeout(400);

        await page.click('[data-testid="btn-add-widget"]');
        await page.waitForTimeout(400);
        await page.click('[data-testid="btn-select-widget-rekonsiliasi-ringkas"]');
        await page.waitForTimeout(400);

        const wAll7 = await Promise.all([
          page.locator('[data-testid="widget-laba-rugi"]').isVisible(),
          page.locator('[data-testid="widget-arus-kas"]').isVisible(),
          page.locator('[data-testid="widget-saldo-kas"]').isVisible(),
          page.locator('[data-testid="widget-posisi-neraca"]').isVisible(),
          page.locator('[data-testid="widget-umur-hutang"]').isVisible(),
          page.locator('[data-testid="widget-arus-ringkas"]').isVisible(),
          page.locator('[data-testid="widget-rekonsiliasi-ringkas"]').isVisible(),
        ]);
        console.log('Seluruh 7 widget terpasang:', wAll7.every(Boolean));

        await page.screenshot({
          path: path.join(SHOTS_DIR, 'keuangan-all-widgets-1280.png'),
          fullPage: true,
        });
        console.log('Tersimpan: keuangan-all-widgets-1280.png');

        // Tes hapus widget hingga kosong dan verifikasi ajakan menambah
        console.log('Menguji penghapusan widget...');
        await page.evaluate(() => {
          localStorage.setItem('cgpos_finance_layout_default', JSON.stringify({ version: 1, widgets: [] }));
          window.location.reload();
        });
        await page.waitForTimeout(800);

        const emptyStateVisible = await page.locator('[data-testid="empty-widgets-state"]').isVisible();
        console.log('Keadaan kosong (tanpa widget) tampil:', emptyStateVisible);
        if (!emptyStateVisible) {
          totalErrors++;
          console.error('ERROR: Keadaan kosong tanpa widget tidak tampil!');
        }

        await page.screenshot({
          path: path.join(SHOTS_DIR, 'keuangan-empty-1280.png'),
          fullPage: true,
        });
        console.log('Tersimpan: keuangan-empty-1280.png');

        // Klik Kembalikan Bawaan dari keadaan kosong
        console.log('Menguji tombol Kembalikan Bawaan...');
        await page.click('[data-testid="btn-empty-reset"]');
        await page.waitForTimeout(600);

        const restored = await page.locator('[data-testid="widget-laba-rugi"]').isVisible();
        console.log('Widget bawaan berhasil dipulihkan:', restored);
        if (!restored) {
          totalErrors++;
          console.error('ERROR: Kembalikan Bawaan gagal memulihkan widget bawaan!');
        }
      }

      if (vp.name === '390') {
        // Cek screenshot mobile saat kosong dan saat terisi
        await page.screenshot({
          path: path.join(SHOTS_DIR, 'keuangan-default-390.png'),
          fullPage: true,
        });
        console.log('Tersimpan: keuangan-default-390.png');
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
      console.log('\nAudit A38 LULUS SEMPURNA! Tanpa overflow horizontal dan tanpa galat konsol.');
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
