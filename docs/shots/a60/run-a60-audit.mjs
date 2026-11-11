import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const OUT_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a60');
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.txt': 'text/x-component; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = (req.url || '/').split('?')[0];
      try {
        urlPath = decodeURIComponent(urlPath);
      } catch {}
      if (urlPath === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      const rel = urlPath.replace(/^\/+/, '');
      const candidates = [
        path.join(OUT_DIR, rel),
        path.join(OUT_DIR, rel + '.html'),
        path.join(OUT_DIR, rel, 'index.html'),
      ];
      let filePath = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!filePath) {
        console.warn('MISSING FILE:', urlPath);
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
    server.on('error', reject);
  });
}

async function checkViewport(page, label) {
  const res = await page.evaluate(() => {
    const doc = document.documentElement;
    const text = document.body.innerText || '';
    return {
      innerWidth: window.innerWidth,
      scrollWidth: doc.scrollWidth,
      overflowX: doc.scrollWidth - window.innerWidth,
      hasMajoo: /\bmajoo\b/i.test(text),
    };
  });
  if (res.overflowX > 1) {
    throw new Error(`[${label}] Horizontal overflow ${res.overflowX}px (scrollWidth=${res.scrollWidth}, innerWidth=${res.innerWidth})`);
  }
  if (res.hasMajoo) {
    throw new Error(`[${label}] Text brand terlarang ditemukan`);
  }
}

async function main() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const errors = [];

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    // 1. /analisa/kepuasan (1440, 1280, 390)
    await page.goto(`${baseUrl}/analisa/kepuasan`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="kepuasan-avg-score"]');
    const avgText = await page.textContent('[data-testid="kepuasan-avg-score"]');
    const pctText = await page.textContent('[data-testid="kepuasan-pct"]');
    if (!avgText?.includes('4.4 / 5,0') || !pctText?.includes('80%')) {
      throw new Error(`Kepuasan summary mismatch: avg="${avgText}", pct="${pctText}"`);
    }
    await checkViewport(page, 'kepuasan-1440');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a60-kepuasan-1440.png'), fullPage: true });

    await page.getByRole('tab', { name: /Perlu atensi/i }).click();
    await page.waitForSelector('text=Tamu Umum');
    await page.getByRole('button', { name: 'Tandai ditindaklanjuti' }).first().click();
    await page.waitForSelector('text=Sudah ditindaklanjuti');
    await page.getByRole('tab', { name: 'Semua' }).click();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await checkViewport(page, 'kepuasan-1280');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a60-kepuasan-1280.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await checkViewport(page, 'kepuasan-390');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a60-kepuasan-390.png'), fullPage: true });

    // 2. /pelanggan/kustom (1280, 390)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseUrl}/pelanggan/kustom`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Preferensi seduh');

    // Reject sensitive PIN field
    await page.getByRole('button', { name: 'Tambah kolom' }).click();
    await page.fill('#cf-label', 'PIN Akses');
    await page.getByRole('button', { name: 'Simpan kolom' }).click();
    await page.waitForSelector('[role="alert"]');
    await page.fill('#cf-label', 'Ukuran Gelas Favorit');
    await page.selectOption('#cf-type', 'select');
    await page.fill('#cf-options', 'Regular, Large');
    await page.getByRole('button', { name: 'Simpan kolom' }).click();
    await page.waitForSelector('text=Ukuran Gelas Favorit');

    await page.evaluate(() => window.scrollTo(0, 0));
    await checkViewport(page, 'kustom-1280');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a60-kustom-1280.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await checkViewport(page, 'kustom-390');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a60-kustom-390.png'), fullPage: true });

    // 3. /pelanggan/pengaturan (1280, 390)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseUrl}/pelanggan/pengaturan`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=3 pelanggan');
    await page.fill('#pol-bday', '10');
    await page.getByRole('button', { name: 'Simpan pengaturan' }).click();
    await page.waitForSelector('text=Kebijakan data pelanggan disimpan.');
    await page.evaluate(() => window.scrollTo(0, 0));
    await checkViewport(page, 'pengaturan-1280');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a60-pengaturan-pelanggan-1280.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await checkViewport(page, 'pengaturan-390');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a60-pengaturan-pelanggan-390.png'), fullPage: true });

    // 4. /dapur -> Tab Layar Gudang (1280, 390)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseUrl}/dapur`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: /Layar Gudang/i }).click();
    await page.waitForSelector('[data-testid="gudang-out-count"]');
    await page.waitForSelector('[data-testid="gudang-low-count"]');
    await page.getByRole('tab', { name: /Perlu restok/i }).click();
    await page.waitForSelector('section[aria-label="Layar gudang"]');

    await page.evaluate(() => window.scrollTo(0, 0));
    await checkViewport(page, 'dapur-gudang-1280');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a60-dapur-gudang-1280.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await checkViewport(page, 'dapur-gudang-390');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a60-dapur-gudang-390.png'), fullPage: true });

    // Extra 1440 check on gudang
    await page.setViewportSize({ width: 1440, height: 900 });
    await checkViewport(page, 'dapur-gudang-1440');

    if (errors.length > 0) {
      throw new Error(`Console/Page errors detected:\n${errors.join('\n')}`);
    }
    console.log('AUDIT A60 LULUS');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

