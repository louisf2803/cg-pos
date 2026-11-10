import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3015;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a32');

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

  const reports = [
    { name: 'penjualan', path: '/laporan/penjualan' },
    { name: 'karyawan', path: '/laporan/karyawan' },
    { name: 'periode', path: '/laporan/periode' },
  ];

  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '1280', width: 1280, height: 800 },
    { name: '390', width: 390, height: 844 },
  ];

  try {
    for (const rep of reports) {
      console.log(`\n=================== Testing Report: ${rep.name} (${rep.path}) ===================`);

      for (const vp of viewports) {
        console.log(`--- Viewport: ${vp.name}px ---`);
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

        await page.goto(`http://localhost:${PORT}${rep.path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);

        // 1. Check overflow
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        console.log(`[${rep.name} @ ${vp.name}px] Horizontal overflow: ${overflow}px`);
        if (overflow > 1) {
          throw new Error(`Horizontal overflow on ${rep.path} at ${vp.name}px: ${overflow}px`);
        }

        // 2. Default state screenshot
        await page.screenshot({ path: path.join(SHOTS_DIR, `${rep.name}-default-${vp.name}.png`), fullPage: true });

        // 3. Test ColumnChooser Popover
        const chooserBtn = page.locator('button:has-text("Atur kolom")');
        if (await chooserBtn.isVisible()) {
          console.log(`[${rep.name} @ ${vp.name}px] Opening ColumnChooser popover...`);
          await chooserBtn.click();
          await page.waitForTimeout(300);

          const popover = page.locator('[role="dialog"][aria-label="Atur kolom tabel"]');
          const popoverVisible = await popover.isVisible();
          if (!popoverVisible) {
            throw new Error(`ColumnChooser popover failed to open on ${rep.path}`);
          }

          // Screenshot with popover open on 1280px
          if (vp.name === '1280') {
            await page.screenshot({ path: path.join(SHOTS_DIR, `${rep.name}-popover-${vp.name}.png`) });
          }

          // Test reordering or keyboard escape on 1440px
          if (vp.name === '1440') {
            const upBtns = popover.locator('button[title="Naik"]');
            const downBtns = popover.locator('button[title="Turun"]');
            if (await downBtns.count() > 0) {
              await downBtns.first().click();
              await page.waitForTimeout(200);
            }

            // Test Escape key closes popover
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            if (await popover.isVisible()) {
              throw new Error(`Escape key did not close popover on ${rep.path}`);
            }
          }

          // Test disabling all columns on 390px (and on 1280px for validation)
          if (vp.name === '390') {
            const checkboxes = popover.locator('input[type="checkbox"]');
            const count = await checkboxes.count();
            for (let i = 0; i < count; i++) {
              const cb = checkboxes.nth(i);
              await cb.uncheck({ force: true });
            }
            await page.waitForTimeout(300);

            // Close popover
            const closeBtn = popover.locator('button:has-text("Selesai")');
            if (await closeBtn.isVisible()) {
              await closeBtn.click();
              await page.waitForTimeout(300);
            }

            // Verify empty state is displayed
            const emptyNotice = page.locator('text=Semua kolom disembunyikan');
            const emptyVisible = await emptyNotice.isVisible();
            console.log(`[${rep.name} @ ${vp.name}px] "Semua kolom disembunyikan" visible: ${emptyVisible}`);
            if (!emptyVisible) {
              throw new Error(`Expected "Semua kolom disembunyikan" empty message when all columns unchecked`);
            }

            // Verify download button is disabled
            const downloadBtn = page.locator('button:has-text("Unduh CSV")');
            const isDisabled = await downloadBtn.isDisabled();
            console.log(`[${rep.name} @ ${vp.name}px] Unduh CSV disabled: ${isDisabled}`);
            if (!isDisabled) {
              throw new Error(`Expected Unduh CSV button to be disabled when all columns are hidden`);
            }

            await page.screenshot({ path: path.join(SHOTS_DIR, `${rep.name}-empty-${vp.name}.png`), fullPage: true });

            // Test Reset button restores default columns
            await chooserBtn.click();
            await page.waitForTimeout(300);
            const resetBtn = page.locator('[role="dialog"] button:has-text("Reset")');
            await resetBtn.click();
            await page.waitForTimeout(300);
            await page.locator('[role="dialog"] button:has-text("Selesai")').click();
            await page.waitForTimeout(300);

            const emptyAfterReset = await emptyNotice.isVisible();
            if (emptyAfterReset) {
              throw new Error(`Expected table to be restored after clicking Reset`);
            }
          }
        }

        if (errors.length > 0) {
          console.error(`[${rep.name} @ ${vp.name}px] Console errors:`, errors);
          throw new Error(`Console errors on ${rep.path} at ${vp.name}px: ${errors.join('; ')}`);
        }

        await context.close();
      }
    }

    console.log('\nAll A32 Playwright checks passed successfully with 0 overflow and 0 console errors!');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('Audit run error:', err);
  process.exit(1);
});
