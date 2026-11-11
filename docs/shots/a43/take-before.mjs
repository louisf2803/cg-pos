import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3031;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a43');

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

  const pages = [
    { path: '/analisa/perputaran-stok', slug: 'analisa-perputaran-stok' },
    { path: '/analisa/waktu-teramai-penjualan', slug: 'analisa-waktu-teramai-penjualan' },
    { path: '/analisa/waktu-teramai-produk', slug: 'analisa-waktu-teramai-produk' },
    { path: '/laporan/dapur', slug: 'laporan-dapur' },
    { path: '/laporan/karyawan', slug: 'laporan-karyawan' },
    { path: '/laporan/pelanggan', slug: 'laporan-pelanggan' },
    { path: '/laporan/persediaan', slug: 'laporan-persediaan' },
    { path: '/laporan/produk', slug: 'laporan-produk' },
    { path: '/produk/barcode', slug: 'produk-barcode' },
  ];

  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '1280', width: 1280, height: 800 },
    { name: '390', width: 390, height: 844 },
  ];

  try {
    for (const p of pages) {
      for (const vp of viewports) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(`http://localhost:${PORT}${p.path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(300);

        await page.screenshot({
          path: path.join(SHOTS_DIR, `before-${p.slug}-${vp.name}.png`),
          fullPage: true,
        });

        await page.close();
      }
      console.log(`[BEFORE] ${p.slug} selesai.`);
    }
  } finally {
    await browser.close();
    server.close();
  }
});

