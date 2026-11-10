import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3036;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a50');

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
  console.log(`Server audit SESUDAH berjalan di http://localhost:${PORT}`);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let hasError = false;

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`Console Error:`, msg.text());
      hasError = true;
    }
  });

  const targets = [
    { name: 'sesudah-keuangan-laba-rugi', url: `http://localhost:${PORT}/keuangan/laporan`, tableSelector: 'table[aria-label="Laba rugi"]' },
    { name: 'sesudah-keuangan-neraca', url: `http://localhost:${PORT}/keuangan/laporan?tab=neraca`, tableSelector: 'table[aria-label="Neraca"]' },
    { name: 'sesudah-keuangan-arus-kas-indirect', url: `http://localhost:${PORT}/keuangan/laporan?tab=arus-kas&metode=tidak-langsung`, tableSelector: 'table[aria-label="Arus kas metode tidak langsung"]' },
    { name: 'sesudah-kategori', url: `http://localhost:${PORT}/kategori`, tableSelector: 'table.cg-data' },
    { name: 'sesudah-laporan-ringkas', url: `http://localhost:${PORT}/laporan`, tableSelector: 'table.cg-data' },
  ];

  for (const t of targets) {
    await page.goto(t.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const metrics = await page.evaluate((selector) => {
      const tbl = document.querySelector(selector);
      if (!tbl) return null;
      const rows = tbl.querySelectorAll('tr');
      let maxRight = 0;
      let cellCount = 0;
      rows.forEach((r) => {
        const lastCell = r.querySelector('td:last-child, th:last-child');
        if (lastCell) {
          cellCount++;
          const rect = lastCell.getBoundingClientRect();
          if (rect.right > maxRight) maxRight = rect.right;
        }
      });
      return {
        tableWidth: tbl.getBoundingClientRect().width,
        maxRight,
        cellCount,
        bodyScrollWidth: document.body.scrollWidth,
      };
    }, t.tableSelector);

    console.log(`[${t.name}]`, metrics);

    if (metrics) {
      if (metrics.maxRight > 390) {
        console.error(`GAGAL: Kolom terakhir melebihi 390px! maxRight = ${metrics.maxRight}`);
        hasError = true;
      } else {
        console.log(`LULUS: Kolom terakhir di dalam viewport (maxRight = ${metrics.maxRight} <= 390)`);
      }
    } else {
      console.error(`GAGAL: Tabel tidak ditemukan untuk selector ${t.tableSelector}`);
      hasError = true;
    }

    const shotPath = path.join(SHOTS_DIR, `${t.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`Saved screenshot: ${shotPath}`);
  }

  // Uji juga modal dialog baris jurnal
  await page.goto(`http://localhost:${PORT}/keuangan/jurnal`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const detailBtn = await page.$('button:has-text("Rincian"), button:has-text("Lihat"), table button');
  if (detailBtn) {
    await detailBtn.click();
    await page.waitForTimeout(400);
    const dialogMetrics = await page.evaluate(() => {
      const tbl = document.querySelector('table[aria-label="Baris jurnal"]');
      if (!tbl) return null;
      const rows = tbl.querySelectorAll('tr');
      let maxRight = 0;
      rows.forEach((r) => {
        const lastCell = r.querySelector('td:last-child, th:last-child');
        if (lastCell) {
          const rect = lastCell.getBoundingClientRect();
          if (rect.right > maxRight) maxRight = rect.right;
        }
      });
      return {
        tableWidth: tbl.getBoundingClientRect().width,
        maxRight,
      };
    });
    console.log(`[sesudah-modal-baris-jurnal]`, dialogMetrics);
    if (dialogMetrics && dialogMetrics.maxRight > 390) {
      console.error(`GAGAL: Baris jurnal modal melebihi 390px! maxRight = ${dialogMetrics.maxRight}`);
      hasError = true;
    } else if (dialogMetrics) {
      console.log(`LULUS: Baris jurnal modal di dalam viewport (maxRight = ${dialogMetrics.maxRight} <= 390)`);
    }
    await page.screenshot({ path: path.join(SHOTS_DIR, 'sesudah-modal-jurnal.png'), fullPage: false });
  }

  await browser.close();
  server.close(() => {
    console.log('Audit selesai. Server dimatikan.');
    if (hasError) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  });
});
