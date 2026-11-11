import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const OUT_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a53');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
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
      const rel = urlPath.replace(/^\/+/, '');
      const candidates = [
        path.join(OUT_DIR, rel),
        path.join(OUT_DIR, rel, 'index.html'),
        path.join(OUT_DIR, `${rel}.html`),
        path.join(OUT_DIR, 'index.html'),
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

      // /deposit catalog page
      await page.goto(`${base}/deposit`, { waitUntil: 'networkidle' });
      const visibleCatalog = vp.width >= 600 ? page.locator('table.cg-data') : page.locator('main ul').first();
      await visibleCatalog.getByText('Deposit 500rb Bonus 50rb').waitFor({ state: 'visible', timeout: 15000 });
      await assertNoOverflow(page, `deposit-${vp.name}`);
      await page.screenshot({ path: path.join(SHOTS_DIR, `a53-deposit-${vp.name}.png`), fullPage: false });

      if (vp.name === '1280') {
        // Test empty state via search
        await page.getByLabel('Cari paket deposit').fill('TidakAdaPaketXyz');
        await page.getByText('Tidak ada paket deposit yang cocok.').waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Tampilkan semua' }).click();

        // Test Tambah paket + validation
        await page.getByRole('button', { name: /Tambah paket/i }).first().click();
        const modal = page.locator('dialog[open]');
        await modal.waitFor({ state: 'visible' });
        await modal.locator('#dep-nama').fill('Paket Uji Platinum');
        await modal.locator('#dep-credit').fill('250000');
        await modal.locator('#dep-price').fill('200000');
        await modal.getByRole('button', { name: 'Simpan paket' }).click();
        await modal.waitFor({ state: 'hidden' });
        await page.locator('table.cg-data').getByText('Paket Uji Platinum').waitFor({ state: 'visible' });

        // Test delete guard on sold package
        await page.getByRole('button', { name: 'Hapus Deposit 100rb' }).click();
        await page.locator('dialog[open]').getByText(/sudah pernah terjual/i).waitFor({ state: 'visible' });
        await page.locator('dialog[open]').getByRole('button', { name: 'Tutup' }).click();
      }

      // /laporan/deposit report page
      await page.goto(`${base}/laporan/deposit`, { waitUntil: 'networkidle' });
      await page.getByRole('tab', { name: /Penjualan Deposit/i }).waitFor({ state: 'visible', timeout: 15000 });
      await assertNoOverflow(page, `laporan-sales-${vp.name}`);
      await page.screenshot({ path: path.join(SHOTS_DIR, `a53-laporan-sales-${vp.name}.png`), fullPage: false });

      await page.getByRole('tab', { name: /Refund Deposit/i }).click();
      const visibleRefunds = vp.width >= 600 ? page.locator('table.cg-data') : page.locator('main ul').first();
      await visibleRefunds.getByText('Fajar Pratama').waitFor({ state: 'visible' });
      await assertNoOverflow(page, `laporan-refunds-${vp.name}`);
      if (vp.name === '1280' || vp.name === '390') {
        await page.screenshot({ path: path.join(SHOTS_DIR, `a53-laporan-refunds-${vp.name}.png`), fullPage: false });
      }

      if (vp.name === '1280') {
        await page.getByLabel('Cari transaksi deposit').fill('TidakAdaPelangganZ');
        await page.getByText(/Belum ada refund saldo deposit/i).waitFor({ state: 'visible' });
      }

      await ctx.close();
    }

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors:\n${consoleErrors.join('\n')}`);
    }
    console.log('ALL A53 PLAYWRIGHT ASSERTIONS PASSED (1440/1280/390, 0 overflow, 0 console errors)');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

