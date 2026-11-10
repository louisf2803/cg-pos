import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3013;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a30');

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

      console.log(`[${vp.name}px] Navigating to /pengaturan/denah...`);
      await page.goto(`http://localhost:${PORT}/pengaturan/denah`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      // 1. Check overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`[${vp.name}px] /pengaturan/denah horizontal overflow: ${overflow}px`);
      if (overflow > 1) {
        throw new Error(`Horizontal overflow on /pengaturan/denah at ${vp.name}px: ${overflow}px`);
      }

      // 2. Check tab buttons
      const tabDenah = page.locator('button[role="tab"]:has-text("Denah")');
      const tabDaftar = page.locator('button[role="tab"]:has-text("Daftar")');
      if (!(await tabDenah.isVisible()) || !(await tabDaftar.isVisible())) {
        throw new Error(`Tabs Denah / Daftar not visible at ${vp.name}px`);
      }

      // 3. Check floor chips and summary
      const floorChips = await page.locator('[aria-label="Filter Lantai"] button').count();
      console.log(`[${vp.name}px] Found ${floorChips} floor chips`);
      if (floorChips < 2) {
        throw new Error(`Expected at least 2 floor chips, got ${floorChips}`);
      }

      // 4. Check table cards
      const tableCards = page.locator('[aria-label="Grid Meja Denah"] button');
      const tableCount = await tableCards.count();
      console.log(`[${vp.name}px] Found ${tableCount} table cards`);
      if (tableCount === 0) {
        throw new Error(`Expected table cards to be present, got 0`);
      }

      // Check card has capacity icon & kursi text
      const firstCardText = await tableCards.first().innerText();
      console.log(`[${vp.name}px] First table card text:\n${firstCardText.replace(/\n/g, ' ')}`);
      if (!firstCardText.includes('kursi')) {
        throw new Error(`Expected table card to show capacity (kursi)`);
      }

      // Screenshot visual grid
      await page.screenshot({ path: path.join(SHOTS_DIR, `denah-grid-${vp.name}.png`), fullPage: true });

      // 5. Test opening drawer
      console.log(`[${vp.name}px] Clicking first table card to open detail drawer...`);
      await tableCards.first().click();
      await page.waitForTimeout(300);

      const drawer = page.locator('div[role="dialog"][aria-label^="Detail Meja"]');
      if (!(await drawer.isVisible())) {
        throw new Error(`Drawer did not open at ${vp.name}px`);
      }
      console.log(`[${vp.name}px] Detail drawer opened successfully.`);

      if (vp.name !== '1440') {
        await page.screenshot({ path: path.join(SHOTS_DIR, `denah-drawer-${vp.name}.png`) });
      }

      // 6. Test closing drawer with Escape
      console.log(`[${vp.name}px] Pressing Escape to close drawer...`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      if (await drawer.isVisible()) {
        throw new Error(`Drawer did not close on Escape key at ${vp.name}px`);
      }
      console.log(`[${vp.name}px] Drawer closed successfully with Escape.`);

      // 7. Test switching to "Daftar" view on 1280px
      if (vp.name === '1280') {
        console.log(`[${vp.name}px] Switching to Daftar tab...`);
        await tabDaftar.click();
        await page.waitForTimeout(300);

        const sections = await page.locator('section[aria-labelledby^="f-"]').count();
        console.log(`[${vp.name}px] Found ${sections} floor sections in Daftar view`);
        if (sections === 0) {
          throw new Error(`Daftar view sections not found`);
        }
        await page.screenshot({ path: path.join(SHOTS_DIR, `denah-daftar-${vp.name}.png`), fullPage: true });

        // Switch back to Denah
        await tabDenah.click();
        await page.waitForTimeout(300);
      }

      if (errors.length > 0) {
        console.error(`[${vp.name}px] Console errors:`, errors);
        throw new Error(`Console errors at ${vp.name}px: ${errors.join('; ')}`);
      }

      await context.close();
    }

    console.log('\nAll A30 Playwright checks passed successfully with 0 overflow and 0 console errors!');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('Audit run error:', err);
  process.exit(1);
});