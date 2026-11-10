import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3014;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a31');

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

      console.log(`[${vp.name}px] Navigating to /produk/barcode...`);
      await page.goto(`http://localhost:${PORT}/produk/barcode`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      // 1. Check overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`[${vp.name}px] /produk/barcode horizontal overflow: ${overflow}px`);
      if (overflow > 1) {
        throw new Error(`Horizontal overflow on /produk/barcode at ${vp.name}px: ${overflow}px`);
      }

      // 2. Check title
      const title = await page.locator('h1').textContent();
      console.log(`[${vp.name}px] Page title: ${title?.trim()}`);

      // 3. Test Select All Printable
      const selectAllBtn = page.locator('button:has-text("Pilih semua ber-SKU")');
      if (await selectAllBtn.isVisible()) {
        await selectAllBtn.click();
        await page.waitForTimeout(300);
      }

      // Check preview canvas has barcode label units
      const labelUnits = page.locator('.label-print-unit');
      const labelCount = await labelUnits.count();
      console.log(`[${vp.name}px] Rendered label units: ${labelCount}`);
      if (labelCount === 0) {
        throw new Error(`Expected at least one label unit in preview canvas`);
      }

      // Verify barcode SVG is rendered inside label
      const svgCount = await page.locator('.label-print-unit svg').count();
      console.log(`[${vp.name}px] Rendered SVG barcodes: ${svgCount}`);
      if (svgCount === 0) {
        throw new Error(`Expected SVG barcode inside label unit`);
      }

      // Verify rect elements exist in SVG
      const rectCount = await page.locator('.label-print-unit svg rect').count();
      if (rectCount < 5) {
        throw new Error(`Expected barcode bars in SVG, got ${rectCount} rects`);
      }

      await page.screenshot({ path: path.join(SHOTS_DIR, `barcode-preview-${vp.name}.png`), fullPage: true });

      // 4. Test preset switching on 1280px
      if (vp.name === '1280') {
        console.log(`[1280px] Switching to 58mm roll preset...`);
        const preset58 = page.locator('button:has-text("Gulungan 58 mm")');
        await preset58.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SHOTS_DIR, `barcode-preset-58mm-${vp.name}.png`), fullPage: true });

        console.log(`[1280px] Switching to 30x20mm preset...`);
        const preset30 = page.locator('button:has-text("30 × 20 mm")');
        await preset30.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SHOTS_DIR, `barcode-preset-30x20-${vp.name}.png`), fullPage: true });

        // Switch back to 40x30mm
        const preset40 = page.locator('button:has-text("40 × 30 mm")');
        await preset40.click();
        await page.waitForTimeout(300);
      }

      if (errors.length > 0) {
        console.error(`[${vp.name}px] Console errors:`, errors);
        throw new Error(`Console errors at ${vp.name}px: ${errors.join('; ')}`);
      }

      await context.close();
    }

    console.log('\nAll A31 Playwright checks passed successfully with 0 overflow and 0 console errors!');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('Audit run error:', err);
  process.exit(1);
});