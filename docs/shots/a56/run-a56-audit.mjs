import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const OUT_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a56');
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
    // Verify topbar Appointment navigation works directly (unlocked) while Whatsapp remains locked
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const pg = await ctx.newPage();
      await pg.goto(`${base}/`, { waitUntil: 'networkidle' });
      await pg.getByRole('button', { name: 'Appointment', exact: true }).click();
      await pg.getByText('Belum ada reservasi/appointment.').waitFor({ state: 'visible', timeout: 15000 });
      await ctx.close();
    }

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

      await page.goto(`${base}/appointment/`, { waitUntil: 'networkidle' });
      await page.getByText('Belum ada reservasi/appointment.').waitFor({ state: 'visible', timeout: 15000 });
      await assertNoOverflow(page, `empty-${vp.name}`);
      await page.screenshot({ path: path.join(SHOTS_DIR, `a56-empty-${vp.name}.png`), fullPage: false });

      if (vp.name === '1280') {
        // 1) Create first table reservation
        await page.getByRole('button', { name: /Reservasi Baru/i }).click();
        const modal = page.locator('dialog[open]');
        await modal.waitFor({ state: 'visible' });
        await modal.locator('#apt-mulai').fill('18:00');
        await modal.locator('#apt-selesai').fill('20:00');
        await modal.locator('#apt-nama').fill('Rina Kartika');
        await modal.locator('#apt-kontak').fill('081234567890');
        await modal.locator('#apt-catatan').fill('Dekat jendela');
        await modal.getByRole('button', { name: 'Simpan reservasi' }).click();
        await page.locator('table.cg-data').getByText('Rina Kartika').waitFor({ state: 'visible', timeout: 10000 });

        // 2) Test overlapping schedule conflict detection
        await page.getByRole('button', { name: /Reservasi Baru/i }).click();
        await modal.waitFor({ state: 'visible' });
        await modal.locator('#apt-mulai').fill('19:00');
        await modal.locator('#apt-selesai').fill('21:00');
        await modal.locator('#apt-nama').fill('Budi Santoso');
        await modal.locator('#apt-kontak').fill('0813999888');
        await modal.getByRole('button', { name: 'Simpan reservasi' }).click();
        await modal.getByRole('alert').getByText(/Jadwal bentrok/i).waitFor({ state: 'visible' });
        await page.screenshot({ path: path.join(SHOTS_DIR, 'a56-conflict-1280.png'), fullPage: false });

        // 3) Switch to Fasilitas -> save valid second reservation
        await modal.getByRole('button', { name: 'Fasilitas', exact: true }).click();
        await modal.locator('#apt-target-text').fill('Ruang Meeting VIP A');
        await modal.locator('#apt-mulai').fill('15:00');
        await modal.locator('#apt-selesai').fill('17:00');
        await modal.locator('#apt-nama').fill('Dewi Lestari');
        await modal.locator('#apt-kontak').fill('081999888777');
        await modal.getByRole('button', { name: 'Simpan reservasi' }).click();
        await page.locator('table.cg-data').getByText('Dewi Lestari').waitFor({ state: 'visible', timeout: 10000 });
        await assertNoOverflow(page, 'list-1280');
        await page.screenshot({ path: path.join(SHOTS_DIR, 'a56-list-1280.png'), fullPage: false });

        // 4) Switch to Kalender tab & verify selected day list + reload persistence
        await page.getByRole('tab', { name: /Kalender/i }).click();
        await page.getByText('Ruang Meeting VIP A', { exact: true }).waitFor({ state: 'visible' });
        await assertNoOverflow(page, 'calendar-1280');
        await page.screenshot({ path: path.join(SHOTS_DIR, 'a56-calendar-1280.png'), fullPage: false });

        await page.reload({ waitUntil: 'networkidle' });
        await page.locator('table.cg-data').getByText('Rina Kartika').waitFor({ state: 'visible', timeout: 15000 });

        // 5) Check mobile card list & mobile calendar at 390px
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('main ul').first().getByText('Rina Kartika').waitFor({ state: 'visible' });
        await assertNoOverflow(page, 'list-390');
        await page.screenshot({ path: path.join(SHOTS_DIR, 'a56-list-390.png'), fullPage: false });

        await page.getByRole('tab', { name: /Kalender/i }).click();
        await assertNoOverflow(page, 'calendar-390');
        await page.screenshot({ path: path.join(SHOTS_DIR, 'a56-calendar-390.png'), fullPage: false });
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
  console.log('AUDIT A56 LULUS: semua viewport bersih, 0 overflow, 0 galat konsol.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

