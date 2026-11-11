import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3035;
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
  console.log(`Server audit SEBELUM berjalan di http://localhost:${PORT}`);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const targets = [
    { name: 'sebelum-keuangan-laba-rugi', url: `http://localhost:${PORT}/keuangan/laporan`, tableSelector: 'table[aria-label="Laba rugi"]' },
    { name: 'sebelum-keuangan-neraca', url: `http://localhost:${PORT}/keuangan/laporan?tab=neraca`, tableSelector: 'table[aria-label="Neraca"]' },
    { name: 'sebelum-kategori', url: `http://localhost:${PORT}/kategori`, tableSelector: 'table.cg-data' },
    { name: 'sebelum-laporan-ringkas', url: `http://localhost:${PORT}/laporan`, tableSelector: 'table.cg-data' },
  ];

  for (const t of targets) {
    await page.goto(t.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

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
      };
    }, t.tableSelector);

    console.log(`[SEBELUM 390px] ${t.name}: tableWidth=${metrics?.tableWidth}px, maxRight=${metrics?.maxRight}px (overflow=${metrics?.maxRight > 390})`);

    await page.screenshot({
      path: path.join(SHOTS_DIR, `${t.name}.png`),
      fullPage: true,
    });
  }

  await browser.close();
  server.close();
  console.log('Selesai mengambil tangkapan SEBELUM.');
});
