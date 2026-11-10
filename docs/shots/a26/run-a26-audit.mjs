import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3009;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a26');

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
    // If it's an asset (has extension or starts with _next), return 404
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

      // 1. Visit /produk (list)
      console.log(`[${vp.name}px] Navigating to /produk...`);
      await page.goto(`http://localhost:${PORT}/produk`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      const overflowList = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`[${vp.name}px] /produk horizontal overflow: ${overflowList}px`);
      if (overflowList > 1) {
        throw new Error(`Horizontal overflow on /produk at ${vp.name}px: ${overflowList}px`);
      }

      await page.screenshot({ path: path.join(SHOTS_DIR, `produk-list-${vp.name}.png`), fullPage: true });

      // Click filter 'Jasa'
      const filterJasa = page.getByRole('tab', { name: 'Jasa', exact: true });
      await filterJasa.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS_DIR, `produk-filter-jasa-${vp.name}.png`), fullPage: true });

      // Click filter 'Barang'
      const filterBarang = page.getByRole('tab', { name: 'Barang', exact: true });
      await filterBarang.click();
      await page.waitForTimeout(400);

      // Click filter 'Semua'
      const filterSemua = page.getByRole('tab', { name: 'Semua', exact: true });
      await filterSemua.click();
      await page.waitForTimeout(400);

      // 2. Visit /produk/baru (tambah produk)
      console.log(`[${vp.name}px] Navigating to /produk/baru...`);
      await page.goto(`http://localhost:${PORT}/produk/baru`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      const overflowBaru = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`[${vp.name}px] /produk/baru horizontal overflow: ${overflowBaru}px`);
      if (overflowBaru > 1) {
        throw new Error(`Horizontal overflow on /produk/baru at ${vp.name}px: ${overflowBaru}px`);
      }

      await page.screenshot({ path: path.join(SHOTS_DIR, `produk-baru-barang-${vp.name}.png`), fullPage: true });

      // Check default is Barang (track stock visible)
      const lacakStokLabel = page.getByText('Lacak stok produk ini');
      const isLacakStokVisible = await lacakStokLabel.isVisible();
      if (!isLacakStokVisible) {
        throw new Error('Expected "Lacak stok produk ini" to be visible for Barang!');
      }

      // Switch to Jasa
      const radioJasa = page.getByRole('radio', { name: 'Jasa', exact: true });
      await radioJasa.click();
      await page.waitForTimeout(400);

      // Verify explanation note is visible
      const noteJasa = page.getByText('Jasa tidak punya stok, langsung terjual saat dipesan.');
      const isNoteVisible = await noteJasa.isVisible();
      if (!isNoteVisible) {
        throw new Error('Expected note "Jasa tidak punya stok, langsung terjual saat dipesan." to be visible!');
      }

      // Verify "Lacak stok" is hidden
      const isLacakStokHidden = !(await lacakStokLabel.isVisible());
      if (!isLacakStokHidden) {
        throw new Error('Expected "Lacak stok produk ini" to be hidden for Jasa!');
      }

      await page.screenshot({ path: path.join(SHOTS_DIR, `produk-baru-jasa-${vp.name}.png`), fullPage: true });

      // Save a Jasa product (at 1280px) to verify persistence and listing with badge
      if (vp.name === '1280') {
        console.log('Filling form to create Jasa product...');
        await page.fill('#nama', 'Jasa Konsultasi Menu');
        await page.fill('#harga', '250000');
        await page.click('button:has-text("Simpan produk")');
        await page.waitForTimeout(1000);

        console.log('Redirected URL:', page.url());
        // Verify badge "Jasa" exists
        const jasaRow = page.locator('tr:has-text("Jasa Konsultasi Menu")');
        await jasaRow.waitFor({ state: 'visible', timeout: 5000 });
        const badge = jasaRow.locator('.cg-badge:has-text("Jasa")');
        const badgeVisible = await badge.isVisible();
        console.log('Badge "Jasa" on list is visible:', badgeVisible);
        if (!badgeVisible) {
          throw new Error('Expected badge "Jasa" on row "Jasa Konsultasi Menu"!');
        }
        await page.screenshot({ path: path.join(SHOTS_DIR, `produk-list-created-jasa-1280.png`), fullPage: true });
      }

      if (errors.length > 0) {
        console.error(`[${vp.name}px] Console errors:`, errors);
        throw new Error(`Console errors at ${vp.name}px: ${errors.join('; ')}`);
      }

      await context.close();
    }

    console.log('\nAll A26 Playwright checks passed successfully with 0 overflow and 0 console errors!');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('Audit run error:', err);
  process.exit(1);
});
