import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const OUT_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a62');
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
      const cleanUrl = (req.url || '/').split('?')[0];
      const rel = decodeURIComponent(cleanUrl).replace(/^\/+/, '');
      const candidates = [
        path.join(OUT_DIR, rel),
        path.join(OUT_DIR, `${rel}.html`),
        path.join(OUT_DIR, rel, 'index.html'),
        path.join(OUT_DIR, '404.html'),
      ];
      for (const filePath of candidates) {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath);
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }
      res.writeHead(404);
      res.end('Not found');
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

async function assertNoOverflowAndConsole(page, label, consoleErrors) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      overflow: doc.scrollWidth > window.innerWidth + 1,
    };
  });
  if (overflow.overflow) {
    throw new Error(`Horizontal overflow at ${label}: ${JSON.stringify(overflow)}`);
  }
  if (consoleErrors.length > 0) {
    throw new Error(`Console errors at ${label}: ${consoleErrors.join('; ')}`);
  }
}

async function main() {
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  const consoleErrors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  try {
    await page.goto(`${baseUrl}/pengaturan/denah`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Denah dan meja');

    // Locate first table card in grid & read its id via data attribute or aria
    const firstTable = page.locator('[aria-label="Grid Meja Denah"] button').first();
    await firstTable.waitFor({ state: 'visible' });

    // Test (b): legacy settings without minBillMode default safely to 'izinkan'
    await page.evaluate(() => {
      localStorage.setItem(
        'cgpos_table_settings',
        JSON.stringify({
          m1: {
            timeLimitEnabled: false,
            timeLimitMinutes: 90,
            reminderEnabled: false,
            reminderBeforeMinutes: 15,
            minBillEnabled: true,
            minBill: 75000,
            labelEnabled: false,
            label: '',
          },
        }),
      );
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[aria-label="Grid Meja Denah"] button').first().click();
    await page.waitForSelector('text=Pengaturan Meja');

    // Verify Minimum Tagihan radio exists and defaults to izinkan if t1/m1 is first
    const izinkanRadio = page.locator('input[name="min-bill-mode"][value="izinkan"]');
    const switchEl = page.getByLabel('Aktifkan Minimum Tagihan');
    if (!(await switchEl.isChecked())) {
      await switchEl.click();
    }
    if (!(await izinkanRadio.isChecked())) {
      throw new Error('Expected legacy setting without minBillMode to default to izinkan');
    }

    // Test (a): switch through each mode, save 'tambah_selisih' and reload
    await page.locator('input[name="min-bill-mode"][value="wajib"]').check();
    await page.getByRole('button', { name: 'Simpan Pengaturan' }).click();
    await page.waitForSelector('text=Pengaturan meja tersimpan');

    await page.locator('input[name="min-bill-mode"][value="tambah_selisih"]').check();
    await page.getByRole('button', { name: 'Simpan Pengaturan' }).click();
    await page.waitForSelector('text=Pengaturan meja tersimpan');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a62-drawer-minbill-1280.png') });

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[aria-label="Grid Meja Denah"] button').first().click();
    await page.waitForSelector('text=Pengaturan Meja');
    const persistedMode = await page
      .locator('input[name="min-bill-mode"][value="tambah_selisih"]')
      .isChecked();
    if (!persistedMode) {
      throw new Error('minBillMode tambah_selisih did not persist after reload');
    }
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).last().click();

    // Switch to Denah Kustom mode
    await page.getByRole('button', { name: /Denah Kustom/ }).click();
    await page.waitForSelector('text=Palet Denah Kustom');

    // Add 3 decorative elements: Tanaman, Dinding, Pintu
    await page.getByRole('button', { name: '+ Tanaman' }).click();
    await page.getByRole('button', { name: '+ Dinding' }).click();
    await page.getByRole('button', { name: '+ Pintu' }).click();

    const tanamanEl = page.locator('[data-decor-type="tanaman"]').first();
    await tanamanEl.waitFor({ state: 'visible' });
    await tanamanEl.scrollIntoViewIfNeeded();
    const beforeX = await tanamanEl.getAttribute('data-pos-x');
    const beforeY = await tanamanEl.getAttribute('data-pos-y');

    // Drag Tanaman horizontally and vertically inside canvas
    const box = await tanamanEl.boundingBox();
    if (!box) throw new Error('Tanaman bounding box missing');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 80, { steps: 12 });
    await page.mouse.up();

    const afterX = await tanamanEl.getAttribute('data-pos-x');
    const afterY = await tanamanEl.getAttribute('data-pos-y');
    if (beforeX === afterX && beforeY === afterY) {
      throw new Error(`Expected decor position to change after drag (${beforeX},${beforeY})`);
    }

    // Delete Dinding via click + Hapus button
    const dindingEl = page.locator('[data-decor-type="dinding"]').first();
    await dindingEl.click();
    await page.getByRole('button', { name: 'Hapus elemen Dinding' }).click();
    if ((await page.locator('[data-decor-type="dinding"]').count()) !== 0) {
      throw new Error('Expected Dinding decorative element to be removed');
    }

    // Reload and verify Tanaman stayed moved, Pintu remained, and Dinding stays deleted,
    // and verify drawer "Pengaturan Meja" does NOT open for Tanaman
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-decor-type="tanaman"]');
    const persistedX = await page.locator('[data-decor-type="tanaman"]').first().getAttribute('data-pos-x');
    const persistedY = await page.locator('[data-decor-type="tanaman"]').first().getAttribute('data-pos-y');
    if (persistedX !== afterX || persistedY !== afterY) {
      throw new Error(`Decor position mismatch after reload: ${persistedX},${persistedY} vs ${afterX},${afterY}`);
    }
    await page.locator('[data-decor-type="tanaman"]').first().click();
    if ((await page.getByRole('dialog').count()) !== 0) {
      throw new Error('Clicking decorative element must NOT open Pengaturan Meja drawer');
    }

    await assertNoOverflowAndConsole(page, 'denah kustom @ 1280', consoleErrors);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a62-custom-canvas-1280.png') });

    await page.setViewportSize({ width: 1440, height: 900 });
    await assertNoOverflowAndConsole(page, 'denah kustom @ 1440', consoleErrors);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a62-custom-canvas-1440.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoOverflowAndConsole(page, 'denah kustom @ 390', consoleErrors);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a62-custom-canvas-390.png') });

    console.log('AUDIT A62 LULUS');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

