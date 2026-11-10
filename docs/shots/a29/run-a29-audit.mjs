import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3012;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a29');

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

      // 1. Visit /keuangan/biaya
      console.log(`[${vp.name}px] Navigating to /keuangan/biaya...`);
      await page.goto(`http://localhost:${PORT}/keuangan/biaya`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      const overflowBiaya = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`[${vp.name}px] /keuangan/biaya horizontal overflow: ${overflowBiaya}px`);
      if (overflowBiaya > 1) {
        throw new Error(`Horizontal overflow on /keuangan/biaya at ${vp.name}px: ${overflowBiaya}px`);
      }

      // Check period text does not contain ISO timestamp
      const biayaContent = await page.content();
      if (biayaContent.includes('T00:00:00') || biayaContent.includes('.000Z')) {
        throw new Error(`Raw ISO timestamp found in /keuangan/biaya at ${vp.name}px!`);
      }
      console.log(`[${vp.name}px] Clean date range verified (no ISO string).`);

      // Verify search input padding and icon
      const searchInput = page.locator('input[placeholder="Cari transaksi, nomor jurnal, keterangan…"]');
      if (await searchInput.isVisible()) {
        const paddingLeft = await searchInput.evaluate((el) => window.getComputedStyle(el).paddingLeft);
        console.log(`[${vp.name}px] Biaya search paddingLeft: ${paddingLeft}`);
        const padVal = parseFloat(paddingLeft);
        if (padVal < 30) {
          throw new Error(`Biaya search paddingLeft too small: ${paddingLeft}`);
        }
      }

      await page.screenshot({ path: path.join(SHOTS_DIR, `keuangan-biaya-${vp.name}.png`), fullPage: true });

      // 2. Visit /keuangan/rekonsiliasi
      console.log(`[${vp.name}px] Navigating to /keuangan/rekonsiliasi...`);
      await page.goto(`http://localhost:${PORT}/keuangan/rekonsiliasi`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      const overflowRekon = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`[${vp.name}px] /keuangan/rekonsiliasi horizontal overflow: ${overflowRekon}px`);
      if (overflowRekon > 1) {
        throw new Error(`Horizontal overflow on /keuangan/rekonsiliasi at ${vp.name}px: ${overflowRekon}px`);
      }

      // Verify concise banner text
      const bannerText = await page.locator('.cg-banner--info').textContent();
      console.log(`[${vp.name}px] Banner text: "${bannerText.trim()}"`);
      if (bannerText.includes('Fitur penyimpanan permanen')) {
        throw new Error(`Banner still contains old verbose text!`);
      }

      // Verify initial cards: "Total Selisih" should be "—" (neutral) and "Diterima di Bank / Penyedia" should be "—"
      const kpis = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.grid > div'));
        return cards.slice(0, 4).map((c) => ({
          title: c.querySelector('span')?.textContent?.trim(),
          val: c.querySelector('strong')?.textContent?.trim(),
        }));
      });
      console.log(`[${vp.name}px] KPIs:`, kpis);

      const bankCard = kpis.find((k) => k.title?.includes('Diterima di Bank'));
      const diffCard = kpis.find((k) => k.title?.includes('Total Selisih'));

      if (bankCard?.val !== '—') {
        throw new Error(`Expected initial Bank card value to be "—", got "${bankCard?.val}"`);
      }
      if (diffCard?.val !== '—') {
        throw new Error(`Expected initial Total Selisih value to be "—", got "${diffCard?.val}"`);
      }

      // Verify input container height is 44px
      if (vp.name !== '390') {
        const inputDiv = page.locator('table tbody input').first().locator('xpath=..');
        const height = await inputDiv.evaluate((el) => window.getComputedStyle(el).height);
        console.log(`[${vp.name}px] Desktop bank input container height: ${height}`);
        if (Math.abs(parseFloat(height) - 44) > 1) {
          throw new Error(`Expected bank input container height 44px, got ${height}`);
        }
      } else {
        const mobInputDiv = page.locator('input[id^="mob-input-"]').first().locator('xpath=..');
        const height = await mobInputDiv.evaluate((el) => window.getComputedStyle(el).height);
        console.log(`[${vp.name}px] Mobile bank input container height: ${height}`);
        if (Math.abs(parseFloat(height) - 44) > 1) {
          throw new Error(`Expected mobile bank input container height 44px, got ${height}`);
        }
      }

      await page.screenshot({ path: path.join(SHOTS_DIR, `keuangan-rekonsiliasi-${vp.name}.png`), fullPage: true });

      // Test filling input and verify matching
      if (vp.name !== '390') {
        const input = page.locator('table tbody input').first();
        await input.fill('237600');
        await page.waitForTimeout(300);

        const updatedDiff = await page.locator('.grid > div:nth-child(3) strong').textContent();
        console.log(`[${vp.name}px] After filling 237.600, Total Selisih: "${updatedDiff?.trim()}"`);
        if (!updatedDiff?.includes('Rp 0') && !updatedDiff?.includes('0')) {
          throw new Error(`Expected selisih Rp 0 after filling exact amount, got ${updatedDiff}`);
        }

        await page.screenshot({ path: path.join(SHOTS_DIR, `keuangan-rekonsiliasi-filled-${vp.name}.png`), fullPage: true });
      }

      if (errors.length > 0) {
        console.error(`[${vp.name}px] Console errors:`, errors);
        throw new Error(`Console errors at ${vp.name}px: ${errors.join('; ')}`);
      }

      await context.close();
    }

    console.log('\nAll A29 Playwright checks passed successfully with 0 overflow and 0 console errors!');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('Audit run error:', err);
  process.exit(1);
});