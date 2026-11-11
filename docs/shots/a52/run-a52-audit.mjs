import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const OUT_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a52');
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
  '.txt': 'text/plain; charset=utf-8',
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
    throw new Error(`Overflow detected at ${label}: scrollWidth=${info.docScroll} > innerWidth=${info.inner}`);
  }
}

async function main() {
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}/pengaturan/denah`;
  const consoleErrors = [];

  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  try {
    // 1. 1440px audit (Grid Meja)
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(`[1440 console] ${msg.text()}`);
      });
      page.on('pageerror', (err) => consoleErrors.push(`[1440 pageerror] ${err.message}`));

      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.locator('[aria-label="Grid Meja Denah"]').waitFor({ state: 'visible', timeout: 15000 });
      await assertNoOverflow(page, '1440-grid');
      await page.screenshot({ path: path.join(SHOTS_DIR, 'a52-grid-1440.png'), fullPage: false });
      await ctx.close();
    }

    // 2. 1280px interactive audit: Denah Kustom drag, save, reload, 4 toggles + validation, empty & long label
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(`[1280 console] ${msg.text()}`);
      });
      page.on('pageerror', (err) => consoleErrors.push(`[1280 pageerror] ${err.message}`));

      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.locator('[aria-label="Grid Meja Denah"]').waitFor({ state: 'visible', timeout: 15000 });

      // Switch to Denah Kustom
      await page.getByRole('button', { name: 'Denah Kustom' }).click();
      await page.locator('[aria-label="Kanvas Denah Kustom"]').waitFor({ state: 'visible' });

      // Mouse pointer drag first card
      const firstCard = page.locator('[data-table-id]').first();
      const beforeX = await firstCard.getAttribute('data-pos-x');
      const beforeY = await firstCard.getAttribute('data-pos-y');
      const box = await firstCard.boundingBox();
      if (!box) throw new Error('First draggable table card has no bounding box');

      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 180, startY + 120, { steps: 12 });
      await page.mouse.up();

      const afterX = await firstCard.getAttribute('data-pos-x');
      const afterY = await firstCard.getAttribute('data-pos-y');
      if (afterX === beforeX && afterY === beforeY) {
        throw new Error(`Drag did not move table coordinates: stayed (${beforeX}, ${beforeY})`);
      }

      // Click Simpan Posisi and reload to verify localStorage persistence
      await page.getByRole('button', { name: /Simpan Posisi/i }).click();
      await page.getByText(/Posisi meja tersimpan/i).waitFor({ state: 'visible' });
      await assertNoOverflow(page, '1280-kustom-drag');
      await page.screenshot({ path: path.join(SHOTS_DIR, 'a52-kustom-drag-1280.png'), fullPage: false });

      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('[aria-label="Kanvas Denah Kustom"]').waitFor({ state: 'visible', timeout: 15000 });
      const reloadedX = await page.locator('[data-table-id]').first().getAttribute('data-pos-x');
      const reloadedY = await page.locator('[data-table-id]').first().getAttribute('data-pos-y');
      if (reloadedX !== afterX || reloadedY !== afterY) {
        throw new Error(`Saved position lost after reload: expected (${afterX},${afterY}), got (${reloadedX},${reloadedY})`);
      }

      // Click first card to open Detail Drawer and test all 4 toggles + validation
      await page.locator('[data-table-id]').first().click();
      const drawer = page.locator('[role="dialog"]');
      await drawer.waitFor({ state: 'visible' });

      const reminderSwitch = drawer.getByRole('switch', { name: 'Aktifkan Pengingat Waktu' });
      if (await reminderSwitch.isEnabled()) {
        throw new Error('Pengingat Waktu should be disabled when Batas Waktu is off');
      }

      await drawer.getByRole('switch', { name: 'Aktifkan Batas Waktu' }).check();
      await drawer.getByLabel('Durasi Batas Waktu (menit)').fill('30');
      await reminderSwitch.check();
      await drawer.getByLabel('Menit Pengingat Waktu').fill('35');
      await drawer.getByRole('button', { name: 'Simpan Pengaturan Meja' }).click();
      await drawer.getByText('Batas waktu harus lebih besar dari pengingat waktu.').waitFor({ state: 'visible' });

      await drawer.getByLabel('Durasi Batas Waktu (menit)').fill('90');
      await drawer.getByLabel('Menit Pengingat Waktu').fill('15');
      await drawer.getByRole('switch', { name: 'Aktifkan Minimum Tagihan' }).check();
      await drawer.getByLabel('Nominal Minimum Tagihan').fill('150000');
      await drawer.getByRole('switch', { name: 'Aktifkan Label Meja' }).check();
      await drawer.getByLabel('Teks Label Meja').fill('VIP Balkon Utama 01');
      await drawer.getByRole('button', { name: 'Simpan Pengaturan Meja' }).click();
      await drawer.getByText(/Pengaturan meja tersimpan/i).waitFor({ state: 'visible' });
      await page.screenshot({ path: path.join(SHOTS_DIR, 'a52-drawer-settings-1280.png'), fullPage: false });

      // Close drawer with Escape
      await page.keyboard.press('Escape');
      await drawer.waitFor({ state: 'hidden' });

      // Test Reset ke Grid
      await page.getByRole('button', { name: 'Reset ke Grid' }).click();
      await page.getByText(/dikembalikan ke susunan grid/i).waitFor({ state: 'visible' });

      // Create empty floor via Tambah lantai -> test empty state ("Belum ada meja di lantai ini.")
      await page.getByRole('button', { name: 'Tambah lantai' }).click();
      const modal = page.locator('dialog[open]');
      await modal.waitFor({ state: 'visible' });
      await modal.locator('input').first().fill('Lantai Rooftop Panorama Panjang');
      await modal.getByRole('button', { name: 'Simpan' }).click();
      await modal.waitFor({ state: 'hidden' });
      await page.getByRole('tab', { name: 'Lantai Rooftop Panorama Panjang' }).click();
      await page.getByText('Belum ada meja di lantai ini.').waitFor({ state: 'visible' });
      await assertNoOverflow(page, '1280-empty-floor');

      await ctx.close();
    }

    // 3. 390px mobile audit (with pre-populated custom positions + long label/table settings)
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(`[390 console] ${msg.text()}`);
      });
      page.on('pageerror', (err) => consoleErrors.push(`[390 pageerror] ${err.message}`));

      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.locator('[aria-label="Grid Meja Denah"]').waitFor({ state: 'visible', timeout: 15000 });

      // Enable settings on first table to verify badges at 390px don't overflow
      await page.locator('[aria-label="Grid Meja Denah"] button').first().click();
      const drawer = page.locator('[role="dialog"]');
      await drawer.waitFor({ state: 'visible' });
      await drawer.getByRole('switch', { name: 'Aktifkan Batas Waktu' }).check();
      await drawer.getByRole('switch', { name: 'Aktifkan Label Meja' }).check();
      await drawer.getByLabel('Teks Label Meja').fill('Meja Sudut VIP 12345');
      await drawer.getByRole('button', { name: 'Simpan Pengaturan Meja' }).click();
      await drawer.getByText(/Pengaturan meja tersimpan/i).waitFor({ state: 'visible' });
      await assertNoOverflow(page, '390-drawer');
      await drawer.getByRole('button', { name: 'Tutup detail meja' }).click();
      await drawer.waitFor({ state: 'hidden' });

      await assertNoOverflow(page, '390-grid');
      await page.screenshot({ path: path.join(SHOTS_DIR, 'a52-grid-390.png'), fullPage: false });

      await page.getByRole('button', { name: 'Denah Kustom' }).click();
      await page.locator('[aria-label="Kanvas Denah Kustom"]').waitFor({ state: 'visible' });
      await assertNoOverflow(page, '390-kustom');
      await page.screenshot({ path: path.join(SHOTS_DIR, 'a52-kustom-390.png'), fullPage: false });

      await ctx.close();
    }

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors recorded:\n${consoleErrors.join('\n')}`);
    }

    console.log('ALL A52 PLAYWRIGHT ASSERTIONS PASSED (1440/1280/390, 0 overflow, 0 console errors)');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

