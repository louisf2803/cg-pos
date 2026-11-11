import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3051;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a51');

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
    const fallbackPath = path.join(STATIC_DIR, 'index.html');
    if (fs.existsSync(fallbackPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(fallbackPath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }
});

server.listen(PORT, async () => {
  console.log(`Server A51 berjalan di http://localhost:${PORT}`);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const consoleErrors = [];
  let failed = false;

  const checkOverflow = async (page, label, viewportWidth) => {
    const res = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    console.log(`[${label} @ ${viewportWidth}px]`, res);
    if (res.scrollWidth > viewportWidth || res.bodyScrollWidth > viewportWidth) {
      console.error(`GAGAL OVERFLOW pada ${label} @ ${viewportWidth}px!`);
      failed = true;
    }
  };

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    const url = `http://localhost:${PORT}/karyawan/hak-akses`;

    // 1. Audit 1440px
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="role-row-cashier"]');
    await checkOverflow(page, 'hak-akses-awal', 1440);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'hak-akses-1440.png'), fullPage: false });

    // 2. Audit 1280px & Modal Tab
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    await checkOverflow(page, 'hak-akses-awal', 1280);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'hak-akses-1280.png'), fullPage: false });

    // Buka dialog Ubah Kasir
    await page.click('[aria-label="Ubah hak akses Kasir"]');
    await page.waitForSelector('dialog[open]');
    await page.click('button[role="tab"]:has-text("Hak Akses Dashboard")');
    await page.waitForSelector('[data-testid="dash-perm-penjualan:produk"]');
    await page.click('[data-testid="dash-perm-penjualan:produk"] button:has-text("Lihat saja")');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'hak-akses-modal-dashboard-1280.png'), fullPage: false });

    await page.click('button[role="tab"]:has-text("Hak Akses POS")');
    await page.waitForSelector('[data-testid="pos-perm-void_order"]');
    await page.click('[data-testid="pos-perm-void_order"] button:has-text("Boleh sendiri")');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'hak-akses-modal-pos-1280.png'), fullPage: false });

    await page.click('button[type="submit"]:has-text("Simpan peran")');
    await page.waitForSelector('[role="status"]');

    // Reload untuk membuktikan persistensi localStorage
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[aria-label="Ubah hak akses Kasir"]');
    await page.click('[aria-label="Ubah hak akses Kasir"]');
    await page.waitForSelector('dialog[open]');
    await page.click('button[role="tab"]:has-text("Hak Akses Dashboard")');
    const prodPressed = await page.getAttribute(
      '[data-testid="dash-perm-penjualan:produk"] button:has-text("Lihat saja")',
      'aria-pressed'
    );
    if (prodPressed !== 'true') {
      throw new Error('Perubahan hak akses dashboard tidak tersimpan setelah muat ulang!');
    }
    await page.click('button:has-text("Batal")');

    // Buat peran kustom dengan nama panjang
    await page.click('button:has-text("Tambah peran")');
    await page.waitForSelector('#role-name');
    await page.fill('#role-name', 'Kepala Shift Malam & Pengawas Meja VIP Coworking');
    await page.fill('#role-desc', 'Deskripsi panjang untuk menguji pembungkusan teks pada kartu mobile dan tabel desktop agar tidak meluap.');
    await page.click('button[type="submit"]:has-text("Simpan peran")');
    await page.waitForTimeout(300);

    // Cek keadaan kosong lewat filter pencarian
    await page.fill('input[placeholder*="Cari nama"]', 'TidakAdaPeranIni999');
    await page.waitForSelector('.cg-empty');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'hak-akses-kosong-1280.png'), fullPage: false });
    await page.click('button:has-text("Tampilkan semua peran")');
    await page.waitForTimeout(200);

    // 3. Audit 390px dengan peran nama panjang
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await checkOverflow(page, 'hak-akses-nama-panjang', 390);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'hak-akses-390.png'), fullPage: false });

    // Buka modal di 390px untuk pastikan dialog tidak overflow
    await page.click('article button:has-text("Ubah")');
    await page.waitForSelector('dialog[open]');
    await page.click('button[role="tab"]:has-text("Hak Akses POS")');
    await page.waitForTimeout(200);
    await checkOverflow(page, 'hak-akses-modal-390', 390);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'hak-akses-modal-390.png'), fullPage: false });
    await page.click('button:has-text("Batal")');

    if (consoleErrors.length > 0) {
      console.error('Console errors detected:', consoleErrors);
      failed = true;
    }
  } catch (err) {
    console.error('Test error:', err);
    failed = true;
  } finally {
    await browser.close();
    server.close(() => {
      console.log('Audit A51 selesai.');
      process.exit(failed ? 1 : 0);
    });
  }
});

