import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const PORT = 4311;
const STATIC_DIR = path.resolve('apps/pos/dist');
const SHOTS_DIR = path.resolve('docs/shots/a23');

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
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  let filePath = path.join(STATIC_DIR, reqPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, async () => {
  console.log(`[TEST-A23] POS static server running on http://localhost:${PORT}`);
  let browser;
  let fail = 0;
  const errs = [];

  const ok = (c, m) => {
    console.log(c ? 'OK  ' : 'GAGAL', m);
    if (!c) fail++;
  };

  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });

    // 1. Run exact trial-e2e test suite on 1280 and 390
    for (const [tag, vp] of [
      ['1280', { width: 1280, height: 800 }],
      ['390', { width: 390, height: 844 }],
    ]) {
      const ctx = await browser.newContext({ viewport: vp });
      const p = await ctx.newPage();

      p.on('console', (m) => {
        if (m.type() === 'error') errs.push(`${tag}: ${m.text()}`);
      });
      p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));

      await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
      await p.waitForSelector('text=Siapa yang bertugas');
      await p.click('text=Sari');
      for (const d of '222222') await p.keyboard.press(d);

      await p.waitForSelector('h1:has-text("Buka kasir"), .cg-shell');
      if ((await p.locator('h1:has-text("Buka kasir")').count()) > 0) {
        await p.click('button.cg-chip:has-text("100.000")');
        await p.click('button:has-text("Buka kasir")');
      }
      await p.waitForSelector('.cg-shell');
      ok(true, `${tag}: shift dibuka`);

      // Search & scan SKU
      const box = p.getByPlaceholder(/scan SKU/);
      await box.fill('nk-001');
      await box.press('Enter');

      // Add custom item
      await p.getByTestId('custom-open').click();
      await p.getByTestId('custom-name').fill('Jasa antar');
      await p.getByTestId('custom-price').fill('10000');
      await p.getByTestId('custom-add').click();
      await p.getByRole('dialog').waitFor({ state: 'detached' });

      if (vp.width < 600 && (await p.locator('button:has-text("Pesanan (")').count())) {
        await p.click('button:has-text("Pesanan (")');
      }
      await p.waitForTimeout(200);

      // Capture cart panel at 1280 and 390
      await p.screenshot({ path: path.join(SHOTS_DIR, `pos-cart-${tag}px.png`) });
      console.log(`[CAPTURE] Saved pos-cart-${tag}px.png`);

      ok(/Jasa antar/.test(await p.locator('body').innerText()), `${tag}: item bebas masuk pesanan`);

      // Go to Payment screen
      await p.getByRole('button', { name: /^Bayar/ }).click();
      await p.waitForTimeout(300);

      // Capture Payment screen at 1280 and 390
      await p.screenshot({ path: path.join(SHOTS_DIR, `pos-payment-${tag}px.png`) });
      console.log(`[CAPTURE] Saved pos-payment-${tag}px.png`);

      // Pay cash
      await p.getByRole('radio', { name: /Tunai/ }).click();
      await p.locator('.cg-chip', { hasText: 'Uang pas' }).click();
      await p.getByRole('button', { name: /^Terima/ }).click();
      await p.getByRole('button', { name: 'Pesanan baru' }).waitFor();
      ok(true, `${tag}: pembayaran tunai lunas, struk tampil`);

      // Shift cash out & close shift
      await p.getByRole('button', { name: 'Pesanan baru' }).click();
      await p.getByRole('button', { name: 'Shift', exact: true }).click();
      await p.getByTestId('cash-out-open').click();
      await p.getByTestId('cash-amount').fill('5000');
      await p.getByTestId('cash-reason').fill('Beli es batu');
      await p.getByTestId('cash-save').click();
      await p.getByTestId('cash-list').waitFor();
      ok(/Beli es batu/.test(await p.getByTestId('cash-list').innerText()), `${tag}: kas keluar tercatat`);

      await p.getByRole('button', { name: /Tutup kasir/ }).click();
      await p.locator('#hitung').fill('105000');
      await p.getByRole('button', { name: 'Tutup kasir', exact: true }).click();
      await p.locator('#pin-tutup').fill('222222');
      await p.getByRole('button', { name: 'Ya, tutup' }).click();
      await p.getByRole('heading', { name: 'Kasir ditutup' }).waitFor();
      ok(true, `${tag}: shift ditutup dengan ringkasan`);

      // Check overflow
      const scrollW = await p.evaluate(() => document.documentElement.scrollWidth);
      ok(scrollW <= vp.width, `${tag}: tanpa overflow horizontal (${scrollW}px <= ${vp.width}px)`);

      await ctx.close();
    }

    // 2. Extra Capture at 1440px
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await ctx.newPage();
      p.on('console', (m) => {
        if (m.type() === 'error') errs.push(`1440: ${m.text()}`);
      });

      await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
      await p.waitForSelector('text=Siapa yang bertugas');
      await p.click('text=Sari');
      for (const d of '222222') await p.keyboard.press(d);
      await p.waitForSelector('h1:has-text("Buka kasir"), .cg-shell');
      if ((await p.locator('h1:has-text("Buka kasir")').count()) > 0) {
        await p.click('button.cg-chip:has-text("100.000")');
        await p.click('button:has-text("Buka kasir")');
      }
      await p.waitForSelector('.cg-shell');

      const box = p.getByPlaceholder(/scan SKU/);
      await box.fill('nk-001');
      await box.press('Enter');
      await p.waitForTimeout(200);

      await p.getByRole('button', { name: /^Bayar/ }).click();
      await p.waitForTimeout(300);

      await p.screenshot({ path: path.join(SHOTS_DIR, 'pos-payment-1440px.png') });
      console.log('[CAPTURE] Saved pos-payment-1440px.png');

      const scrollW1440 = await p.evaluate(() => document.documentElement.scrollWidth);
      ok(scrollW1440 <= 1440, `1440px: tanpa overflow horizontal (${scrollW1440}px <= 1440px)`);

      await ctx.close();
    }

    ok(errs.length === 0, 'tanpa galat konsol' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  } catch (err) {
    console.error('[TEST-A23] Fatal error:', err);
    fail++;
  } finally {
    if (browser) await browser.close();
    server.close();
    process.exit(fail ? 1 : 0);
  }
});

