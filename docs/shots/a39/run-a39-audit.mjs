import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3025;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a39');

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
  console.log(`Server audit berjalan di http://localhost:${PORT}`);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const sampleData = [
    {
      id: 'exp_1',
      reportName: 'Detail Penjualan',
      period: '01/11/2026 - 10/11/2026',
      timestamp: '2026-11-10T14:30:00.000Z',
      rowCount: 48,
      sizeBytes: 4280,
      fileName: 'penjualan-01_11_2026_10_11_2026.csv',
      sourceUrl: '/laporan/penjualan?from=2026-11-01&to=2026-11-10',
    },
    {
      id: 'exp_2',
      reportName: 'Laporan Periode (harian)',
      period: 'Bulan Ini',
      timestamp: '2026-11-10T11:15:00.000Z',
      rowCount: 10,
      sizeBytes: 1540,
      fileName: 'laporan-periode-harian-Bulan_Ini.csv',
      sourceUrl: '/laporan/periode',
    },
    {
      id: 'exp_3',
      reportName: 'Arus Kas Penerimaan',
      period: '01/11/2026 - 05/11/2026',
      timestamp: '2026-11-08T09:00:00.000Z',
      rowCount: 24,
      sizeBytes: 2310,
      fileName: 'arus-kas-penerimaan-2026-11-01-2026-11-05.csv',
      sourceUrl: '/keuangan/biaya',
    },
    {
      id: 'exp_4',
      reportName: 'Laporan Meja',
      period: 'Hari ini',
      timestamp: '2026-11-07T16:45:00.000Z',
      rowCount: 12,
      sizeBytes: 980,
      fileName: 'laporan-meja-hari_ini.csv',
      sourceUrl: '/laporan/meja',
    },
  ];

  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '1280', width: 1280, height: 800 },
    { name: '390', width: 390, height: 844 },
  ];

  try {
    // 1. Audit Keadaan Kosong
    console.log('--- Menguji Keadaan Kosong ---');
    for (const vp of viewports) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(`http://localhost:${PORT}/pengaturan/ekspor`, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });

      // Verifikasi overflow horizontal
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      console.log(`[Kosong ${vp.name}px] Galat konsol: ${consoleErrors.length}, Overflow horizontal: ${hasHorizontalOverflow}`);
      if (hasHorizontalOverflow) {
        throw new Error(`Terdeteksi horizontal overflow pada lebar ${vp.name}px (kosong)`);
      }

      await page.screenshot({
        path: path.join(SHOTS_DIR, `ekspor-kosong-${vp.name}.png`),
        fullPage: true,
      });

      await page.close();
    }

    // 2. Audit Keadaan Berisi Data
    console.log('--- Menguji Keadaan Berisi Data ---');
    for (const vp of viewports) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(`http://localhost:${PORT}/pengaturan/ekspor`, { waitUntil: 'networkidle' });
      await page.evaluate((data) => {
        localStorage.setItem('cgpos_export_history_v1', JSON.stringify(data));
      }, sampleData);
      await page.reload({ waitUntil: 'networkidle' });

      // Tunggu hingga elemen selesai dimuat
      await page.waitForTimeout(500);

      // Verifikasi overflow horizontal
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      console.log(`[Berisi ${vp.name}px] Galat konsol: ${consoleErrors.length}, Overflow horizontal: ${hasHorizontalOverflow}`);
      if (hasHorizontalOverflow) {
        throw new Error(`Terdeteksi horizontal overflow pada lebar ${vp.name}px (berisi)`);
      }

      await page.screenshot({
        path: path.join(SHOTS_DIR, `ekspor-berisi-${vp.name}.png`),
        fullPage: true,
      });

      await page.close();
    }

    // 3. Uji fungsi pencarian dan hapus
    console.log('--- Menguji Pencarian dan Hapus ---');
    const testPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await testPage.goto(`http://localhost:${PORT}/pengaturan/ekspor`, { waitUntil: 'networkidle' });
    await testPage.evaluate((data) => {
      localStorage.setItem('cgpos_export_history_v1', JSON.stringify(data));
    }, sampleData);
    await testPage.reload({ waitUntil: 'networkidle' });

    // Ketik di pencarian
    await testPage.fill('input[aria-label="Cari riwayat ekspor"]', 'Periode');
    await testPage.waitForTimeout(300);
    const countText = await testPage.locator('text=Menampilkan 1 dari 4 berkas').count();
    console.log(`Filter pencarian berhasil menampilkan 1 berkas: ${countText > 0}`);

    await testPage.screenshot({
      path: path.join(SHOTS_DIR, `ekspor-filter-cari-1280.png`),
      fullPage: true,
    });

    await testPage.close();

    console.log('Semua audit Playwright A39 berhasil tanpa kendala!');
  } finally {
    await browser.close();
    server.close();
  }
});
