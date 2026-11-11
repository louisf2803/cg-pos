import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const OUT_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a55');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      const rel = urlPath.replace(/^\/+/, '');
      const candidates = [
        path.join(OUT_DIR, rel),
        path.join(OUT_DIR, rel, 'index.html'),
        path.join(OUT_DIR, `${rel}.html`),
      ];
      for (const file of candidates) {
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          const ext = path.extname(file);
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
          fs.createReadStream(file).pipe(res);
          return;
        }
      }
      res.writeHead(404);
      res.end('Not Found');
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

async function assertNoOverflow(page, label) {
  const info = await page.evaluate(() => ({
    docScroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  if (info.docScroll > info.inner) {
    throw new Error(`Overflow at ${label}: scrollWidth=${info.docScroll} > innerWidth=${info.inner}`);
  }
}

async function main() {
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const consoleErrors = [];

  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  try {
    for (const vp of [
      { name: '1440', width: 1440, height: 900 },
      { name: '1280', width: 1280, height: 800 },
      { name: '390', width: 390, height: 844 },
    ]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(`[${vp.name}] ${m.text()}`);
      });
      page.on('pageerror', (e) => consoleErrors.push(`[${vp.name} pageerror] ${e.message}`));

      // 1) Initial empty state checks at all viewports
      await page.goto(`${base}/inventori/bayar-faktur/`, { waitUntil: 'networkidle' });
      await page.getByText('Belum ada faktur pembelian.').waitFor({ state: 'visible', timeout: 15000 });
      await assertNoOverflow(page, `bayar-faktur-empty-${vp.name}`);
      await page.screenshot({ path: path.join(SHOTS_DIR, `a55-bayar-faktur-empty-${vp.name}.png`), fullPage: false });

      await page.goto(`${base}/inventori/retur/`, { waitUntil: 'networkidle' });
      await page.getByText('Belum ada retur pembelian.').waitFor({ state: 'visible', timeout: 15000 });
      await assertNoOverflow(page, `retur-empty-${vp.name}`);
      await page.screenshot({ path: path.join(SHOTS_DIR, `a55-retur-empty-${vp.name}.png`), fullPage: false });

      // 2) Full interactive SPA flow on 1280 (and verify 390 list via viewport resize while keeping SPA state)
      if (vp.name === '1280') {
        await page.goto(`${base}/inventori/bayar-faktur/`, { waitUntil: 'networkidle' });
        await page.getByRole('link', { name: 'Buat Faktur Pembelian' }).click();
        await page.getByRole('button', { name: 'Buat faktur pertama' }).click();
        await page.locator('#fk-pemasok').waitFor({ state: 'visible', timeout: 15000 });

        // Select supplier (2nd option), set termin 14, choose 1st product, price 15000 (total 150000)
        const supOpts = await page.locator('#fk-pemasok option').evaluateAll((els) => els.map((e) => e.value));
        if (supOpts[1]) await page.locator('#fk-pemasok').selectOption(supOpts[1]);
        await page.locator('#fk-termin').fill('14');
        const prodSelect = page.getByLabel('Barang baris 1');
        const prodOpts = await prodSelect.locator('option').evaluateAll((els) => els.map((e) => e.value));
        await prodSelect.selectOption(prodOpts[1]);
        await page.getByLabel('Jumlah baris 1').fill('10');
        await page.getByLabel('Harga satuan baris 1').fill('15000');
        await page.getByRole('button', { name: 'Buat faktur' }).click();
        await page.getByText(/Faktur FPB-000001 dibuat/i).waitFor({ state: 'visible', timeout: 15000 });

        // Navigate via sidebar link back to /inventori/bayar-faktur (SPA keeps in-memory FakeDataLayer)
        await page.locator('aside a[href^="/inventori/bayar-faktur"]').click();
        await page.locator('table.cg-data').getByText('FPB-000001').waitFor({ state: 'visible', timeout: 15000 });
        await assertNoOverflow(page, 'bayar-faktur-1280');
        await page.screenshot({ path: path.join(SHOTS_DIR, 'a55-bayar-faktur-1280.png'), fullPage: false });

        // Search empty check
        await page.getByLabel('Cari faktur pembayaran').fill('TidakAdaFakturXyz');
        await page.getByText('Tidak ada faktur yang cocok.').waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Bersihkan pencarian' }).click();

        // Expand Riwayat & pay partial
        await page.locator('table.cg-data').getByRole('button', { name: /Riwayat/i }).first().click();
        await page.locator('table.cg-data').getByText('Belum ada pembayaran tercatat untuk faktur ini.').waitFor({ state: 'visible' });
        await page.locator('table.cg-data').getByRole('button', { name: /Catat pembayaran/i }).first().click();
        const payModal = page.locator('dialog[open]');
        await payModal.waitFor({ state: 'visible' });
        await payModal.locator('#pay-nominal').fill('50000');
        await payModal.locator('#pay-catatan').fill('Termin parsial audit');
        await payModal.getByRole('button', { name: 'Simpan pembayaran' }).click();
        await page.getByText(/Pembayaran faktur FPB-000001 dicatat/i).waitFor({ state: 'visible', timeout: 10000 });
        await assertNoOverflow(page, 'bayar-faktur-paid-1280');
        await page.screenshot({ path: path.join(SHOTS_DIR, 'a55-bayar-faktur-paid-1280.png'), fullPage: false });

        // Navigate via sidebar to /inventori/retur
        await page.locator('aside a[href^="/inventori/retur"]').click();
        await page.getByRole('button', { name: /Buat retur pertama/i }).waitFor({ state: 'visible', timeout: 15000 });
        await page.getByRole('button', { name: /Buat retur pertama/i }).click();
        const retModal = page.locator('dialog[open]');
        await retModal.waitFor({ state: 'visible' });

        const qtyInput = retModal.locator('input[aria-label^="Jumlah retur "]:not([disabled])').first();
        await qtyInput.waitFor({ state: 'visible', timeout: 10000 });
        await qtyInput.fill('999999');
        await retModal.locator('#ret-alasan').fill('Kemasan rusak saat pengiriman');
        await retModal.getByRole('button', { name: 'Simpan retur' }).click();
        await retModal.getByRole('alert').waitFor({ state: 'visible' });

        await qtyInput.fill('2');
        await retModal.getByRole('button', { name: 'Simpan retur' }).click();
        await page.locator('table.cg-data').getByText('Kemasan rusak saat pengiriman').waitFor({ state: 'visible', timeout: 15000 });
        await assertNoOverflow(page, 'retur-created-1280');
        await page.screenshot({ path: path.join(SHOTS_DIR, 'a55-retur-created-1280.png'), fullPage: false });

        // Also check list layout on 390px while keeping SPA state!
        await page.setViewportSize({ width: 390, height: 844 });
        await assertNoOverflow(page, 'retur-created-390');
        await page.screenshot({ path: path.join(SHOTS_DIR, 'a55-retur-created-390.png'), fullPage: false });
      }

      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (consoleErrors.length > 0) {
    throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
  }
  console.log('AUDIT A55 LULUS: semua viewport bersih, 0 overflow, 0 galat konsol.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
