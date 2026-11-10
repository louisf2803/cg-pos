import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3021;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a48');

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

      // Kunjungi layar catatan siap pakai
      await page.goto(`http://localhost:${PORT}/pengaturan/catatan`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);

      // Verifikasi overflow horizontal
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      console.log(`[${vp.name}px] Horizontal overflow: ${overflow ? 'ADA (GAGAL)' : 'NIHIL (LULUS)'}`);
      if (overflow) {
        totalErrors++;
        console.error(`ERROR: Terdeteksi horizontal scroll pada ${vp.name}px`);
      }

      // Verifikasi komponen kunci
      const previewTitle = page.locator('h3:has-text("Begini Tampil di Kasir")');
      const isPreviewVisible = await previewTitle.isVisible();
      console.log(`[${vp.name}px] Pratinjau Kasir: visible=${isPreviewVisible}`);
      if (!isPreviewVisible) {
        totalErrors++;
        console.error(`ERROR: Pratinjau kasir tidak tampil pada ${vp.name}px`);
      }

      // Tangkapan layar utama
      await page.screenshot({ path: path.join(SHOTS_DIR, `catatan-${vp.name}.png`), fullPage: false });
      console.log(`Tersimpan: catatan-${vp.name}.png`);

      if (vp.name === '1280') {
        // Uji buka modal tambah catatan
        const tambahBtn = page.locator('button:has-text("Tambah catatan")').first();
        await tambahBtn.click();
        await page.waitForTimeout(400);

        const modalTitle = page.locator('#dialog-preset-title');
        const isModalVisible = await modalTitle.isVisible();
        console.log(`[1280px] Modal Tambah Catatan: visible=${isModalVisible}`);
        if (!isModalVisible) {
          totalErrors++;
          console.error('ERROR: Modal tambah catatan tidak terbuka');
        }

        await page.screenshot({ path: path.join(SHOTS_DIR, 'catatan-modal-tambah-1280.png'), fullPage: false });
        console.log('Tersimpan: catatan-modal-tambah-1280.png');

        // Tutup modal
        const batalBtn = page.locator('button:has-text("Batal")');
        await batalBtn.click();
        await page.waitForTimeout(300);

        // Uji buka modal hapus catatan (klik tombol sampah pertama)
        const hapusBtn = page.locator('button[aria-label^="Hapus"]').first();
        if (await hapusBtn.isVisible()) {
          await hapusBtn.click();
          await page.waitForTimeout(400);

          const deleteTitle = page.locator('#delete-confirm-title');
          const isDeleteVisible = await deleteTitle.isVisible();
          console.log(`[1280px] Modal Konfirmasi Hapus: visible=${isDeleteVisible}`);
          if (!isDeleteVisible) {
            totalErrors++;
            console.error('ERROR: Modal konfirmasi hapus tidak terbuka');
          }

          await page.screenshot({ path: path.join(SHOTS_DIR, 'catatan-modal-hapus-1280.png'), fullPage: false });
          console.log('Tersimpan: catatan-modal-hapus-1280.png');

          const batalHapusBtn = page.locator('button:has-text("Batal")');
          await batalHapusBtn.click();
          await page.waitForTimeout(300);
        }
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
      console.error(`\nAudit A48 selesai dengan ${totalErrors} galat.`);
      process.exit(1);
    } else {
      console.log('\nAudit A48 LULUS SEMPURNA! Tanpa overflow horizontal dan tanpa galat konsol.');
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
