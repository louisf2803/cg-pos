import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const PORT = 4311;
const STATIC_DIR = path.resolve('apps/pos/dist');
const SHOTS_DIR = path.resolve('docs/shots/a24');

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
  console.log(`[TEST-A24] POS static server running on http://localhost:${PORT}`);
  let browser;
  let fail = 0;
  const errs = [];
  const ok = (c, m) => {
    console.log(c ? 'OK  ' : 'FAIL', m);
    if (!c) fail++;
  };

  try {
    browser = await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    });

    // 1. Jalankan alur trial e2e di 1280 dan 390
    for (const [tag, vp] of [
      ['1280', { width: 1280, height: 800 }],
      ['390', { width: 390, height: 844 }],
    ]) {
      const ctx = await browser.newContext({ viewport: vp });
      const p = await ctx.newPage();
      p.on('console', (m) => {
        if (m.type() === 'error') errs.push(`${tag} console: ${m.text()}`);
      });
      p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));

      await p.goto(`http://localhost:${PORT}/`);
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

      const box = p.getByPlaceholder(/scan SKU/);
      await box.fill('nk-001');
      await box.press('Enter');

      await p.getByTestId('custom-open').click();
      await p.getByTestId('custom-name').fill('Jasa antar');
      await p.getByTestId('custom-price').fill('10000');
      await p.getByTestId('custom-add').click();
      await p.getByRole('dialog').waitFor({ state: 'detached' });

      if (vp.width < 600 && (await p.locator('button:has-text("Pesanan (")').count()) > 0) {
        await p.click('button:has-text("Pesanan (")');
      }
      ok(/Jasa antar/.test(await p.locator('body').innerText()), `${tag}: item bebas masuk pesanan`);

      await p.getByRole('button', { name: /^Bayar/ }).click();
      await p.getByRole('radio', { name: /Tunai/ }).click();
      await p.locator('.cg-chip', { hasText: 'Uang pas' }).click();
      await p.getByRole('button', { name: /^Terima/ }).click();
      await p.getByRole('button', { name: 'Pesanan baru' }).waitFor();
      ok(true, `${tag}: pembayaran tunai lunas, struk tampil`);

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

      ok(
        (await p.evaluate(() => document.documentElement.scrollWidth)) <= vp.width,
        `${tag}: tanpa overflow horizontal`
      );
      await ctx.close();
    }

    // 2. Audit mendalam A24: Drawer, Penjualan, Daftar Order di 1280, 1440, dan 390
    for (const [tag, vp] of [
      ['1280', { width: 1280, height: 800 }],
      ['1440', { width: 1440, height: 900 }],
      ['390', { width: 390, height: 844 }],
    ]) {
      console.log(`\n--- Pengujian Fitur A24 pada viewport ${tag} ---`);
      const ctx = await browser.newContext({ viewport: vp });
      const p = await ctx.newPage();
      p.on('console', (m) => {
        if (m.type() === 'error') errs.push(`${tag} console: ${m.text()}`);
      });
      p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));

      await p.goto(`http://localhost:${PORT}/`);
      await p.waitForSelector('text=Siapa yang bertugas');
      await p.click('text=Sari');
      for (const d of '222222') await p.keyboard.press(d);

      await p.waitForSelector('h1:has-text("Buka kasir"), .cg-shell');
      if ((await p.locator('h1:has-text("Buka kasir")').count()) > 0) {
        await p.click('button.cg-chip:has-text("100.000")');
        await p.click('button:has-text("Buka kasir")');
      }
      await p.waitForSelector('.cg-shell');

      // (A) Buka Drawer via tombol hamburger di header
      console.log(`${tag}: Menguji side drawer...`);
      await p.locator('button[aria-label="Menu kasir"]').click();
      await p.waitForSelector('nav[aria-label="Menu kasir"]');
      ok(await p.locator('text=Tutup kasir').isVisible(), `${tag}: item dasar Tutup kasir terlihat`);
      await p.screenshot({ path: path.join(SHOTS_DIR, `pos-drawer-${tag}.png`) });

      // Verifikasi Escape menutup drawer
      await p.keyboard.press('Escape');
      await p.waitForSelector('nav[aria-label="Menu kasir"]', { state: 'detached' });
      ok(true, `${tag}: drawer ditutup via tombol Escape`);

      // (B) Buka drawer kembali lalu navigasi ke Penjualan (hari ini)
      await p.locator('button[aria-label="Menu kasir"]').click();
      await p.waitForSelector('nav[aria-label="Menu kasir"]');
      await p.click('button:has-text("Penjualan (hari ini)")');
      await p.waitForSelector('h1:has-text("Penjualan Hari Ini")');
      ok(await p.locator('text=Total Penjualan').isVisible(), `${tag}: kartu Total Penjualan tampil`);
      ok(await p.locator('text=Jumlah Transaksi').isVisible(), `${tag}: kartu Jumlah Transaksi tampil`);
      await p.screenshot({ path: path.join(SHOTS_DIR, `pos-sales-${tag}.png`) });

      // Kembali ke kasir
      await p.click('button[aria-label="Kembali ke kasir"]');
      await p.waitForSelector('.cg-shell');

      // (C) Buka Daftar Order
      console.log(`${tag}: Menguji Daftar Order...`);
      await p.locator('button[aria-label="Daftar Order"]').click();
      await p.waitForSelector('h1:has-text("Daftar Order")');
      ok(true, `${tag}: Daftar Order terbuka`);
      await p.screenshot({ path: path.join(SHOTS_DIR, `pos-orders-${tag}.png`) });

      // Cek tombol Filter
      await p.click('button:has-text("Filter")');
      await p.waitForSelector('h2:has-text("Filter Pesanan")');
      await p.screenshot({ path: path.join(SHOTS_DIR, `pos-orders-filter-${tag}.png`) });
      await p.click('button:has-text("Terapkan Filter")');

      // Kembali ke kasir
      await p.click('button[aria-label="Kembali ke kasir"]');
      await p.waitForSelector('.cg-shell');

      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      ok(sw <= vp.width, `${tag}: tanpa overflow horizontal (sw: ${sw} <= vp: ${vp.width})`);

      await ctx.close();
    }
  } catch (err) {
    console.error('Audit exception:', err);
    fail++;
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  ok(errs.length === 0, `tanpa galat konsol (${errs.length} errors)`);
  if (errs.length > 0) {
    errs.forEach((e) => console.error(' ->', e));
  }
  console.log(`\nAudit selesai dengan ${fail} kegagalan.`);
  process.exit(fail ? 1 : 0);
});
