import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3019;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a46');

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

      // Kunjungi layar dapur
      await page.goto(`http://localhost:${PORT}/dapur`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);

      // Verifikasi overflow horizontal pada tampilan awal (Semua)
      const overflowSemua = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      console.log(`[${vp.name}px] Horizontal overflow (Semua): ${overflowSemua ? 'ADA (GAGAL)' : 'NIHIL (LULUS)'}`);
      if (overflowSemua) {
        totalErrors++;
        console.error(`ERROR: Terdeteksi horizontal scroll pada ${vp.name}px (Semua)`);
      }

      // Verifikasi keberadaan chip filter stasiun
      const stationGroup = page.locator('div[aria-label="Filter Stasiun"]');
      const semuaChip = stationGroup.locator('button:has-text("Semua")');
      const dapurChip = stationGroup.locator('button:has-text("Dapur")');
      const barChip = stationGroup.locator('button:has-text("Bar")');

      const isSemuaVisible = await semuaChip.isVisible();
      const isDapurVisible = await dapurChip.isVisible();
      const isBarVisible = await barChip.isVisible();
      console.log(`[${vp.name}px] Chip stasiun: Semua=${isSemuaVisible}, Dapur=${isDapurVisible}, Bar=${isBarVisible}`);

      if (!isSemuaVisible || !isDapurVisible || !isBarVisible) {
        totalErrors++;
        console.error(`ERROR: Chip stasiun tidak lengkap pada ${vp.name}px`);
      }

      // Tangkapan layar tampilan "Semua"
      await page.screenshot({ path: path.join(SHOTS_DIR, `dapur-semua-${vp.name}.png`), fullPage: false });
      console.log(`Tersimpan: dapur-semua-${vp.name}.png`);

      // Uji klik stasiun "Dapur"
      await dapurChip.click();
      await page.waitForTimeout(600);

      const overflowDapur = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      console.log(`[${vp.name}px] Horizontal overflow (Dapur): ${overflowDapur ? 'ADA (GAGAL)' : 'NIHIL (LULUS)'}`);
      if (overflowDapur) {
        totalErrors++;
        console.error(`ERROR: Terdeteksi horizontal scroll pada ${vp.name}px (Dapur)`);
      }

      if (vp.name === '1280') {
        await page.screenshot({ path: path.join(SHOTS_DIR, 'dapur-stasiun-dapur-1280.png'), fullPage: false });
        console.log('Tersimpan: dapur-stasiun-dapur-1280.png');
      }

      // Uji klik stasiun "Bar"
      await barChip.click();
      await page.waitForTimeout(600);

      const overflowBar = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      console.log(`[${vp.name}px] Horizontal overflow (Bar): ${overflowBar ? 'ADA (GAGAL)' : 'NIHIL (LULUS)'}`);
      if (overflowBar) {
        totalErrors++;
        console.error(`ERROR: Terdeteksi horizontal scroll pada ${vp.name}px (Bar)`);
      }

      if (vp.name === '1280') {
        await page.screenshot({ path: path.join(SHOTS_DIR, 'dapur-stasiun-bar-1280.png'), fullPage: false });
        console.log('Tersimpan: dapur-stasiun-bar-1280.png');
      } else if (vp.name === '390') {
        await page.screenshot({ path: path.join(SHOTS_DIR, 'dapur-stasiun-bar-390.png'), fullPage: false });
        console.log('Tersimpan: dapur-stasiun-bar-390.png');
      }

      // Kembalikan ke "Semua" untuk verifikasi localStorage try/catch
      await semuaChip.click();
      await page.waitForTimeout(400);

      if (errors.length > 0) {
        console.error(`[${vp.name}px] Console errors:`, errors);
        totalErrors += errors.length;
      } else {
        console.log(`[${vp.name}px] Console errors: NIHIL (LULUS)`);
      }

      await context.close();
    }

    if (totalErrors > 0) {
      console.error(`\nAudit A46 selesai dengan ${totalErrors} galat.`);
      process.exit(1);
    } else {
      console.log('\nAudit A46 LULUS SEMPURNA! Tanpa overflow horizontal dan tanpa galat konsol.');
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
