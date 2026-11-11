import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3029;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a42');

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

  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '1280', width: 1280, height: 800 },
    { name: '390', width: 390, height: 844 },
  ];

  const routes = [
    { path: '/analisa/waktu-teramai-penjualan', slug: 'analisa-penjualan' },
    { path: '/analisa/waktu-teramai-produk', slug: 'analisa-produk' },
    { path: '/analisa/perputaran-stok', slug: 'analisa-stok' },
  ];

  try {
    for (const route of routes) {
      for (const vp of viewports) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        const consoleErrors = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await page.goto(`http://localhost:${PORT}${route.path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);

        // Verifikasi overflow horizontal
        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        console.log(`[${route.slug} ${vp.name}px] Galat konsol: ${consoleErrors.length}, Overflow horizontal: ${hasHorizontalOverflow}`);
        if (hasHorizontalOverflow) {
          throw new Error(`Terdeteksi horizontal overflow pada ${route.slug} ${vp.name}px`);
        }

        await page.screenshot({
          path: path.join(SHOTS_DIR, `${route.slug}-${vp.name}.png`),
          fullPage: true,
        });

        // Pada 390px, ambil tangkapan layar spesifik kartu KPI untuk verifikasi tidak ada ellipsis
        if (vp.name === '390') {
          const kpiGrid = page.locator('div[aria-label^="Ringkasan"]').first();
          if (await kpiGrid.count() > 0) {
            await kpiGrid.screenshot({
              path: path.join(SHOTS_DIR, `${route.slug}-kpi-390.png`),
            });
          }
        }

        await page.close();
      }
    }

    console.log('Semua audit Playwright A42 berhasil tanpa kendala!');
  } finally {
    await browser.close();
    server.close();
  }
});
