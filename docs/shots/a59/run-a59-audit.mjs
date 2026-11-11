import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const { chromium } = await import(
  'file:///C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
);

const OUT_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a59');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/x-component; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function resolveFile(reqUrl) {
  const clean = decodeURIComponent((reqUrl || '/').split('?')[0]);
  const rel = clean.replace(/^\/+/, '');
  const candidates = [
    path.join(OUT_DIR, rel),
    path.join(OUT_DIR, rel, 'index.html'),
    path.join(OUT_DIR, `${rel}.html`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const server = http.createServer((req, res) => {
  if ((req.url || '').split('?')[0] === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  const filePath = resolveFile(req.url);
  if (!filePath) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const BASE = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});

const consoleErrors = [];
const pageErrors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
  });

  async function assertCleanPage(label) {
    const res = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      hasForbiddenVendor: /\bmajoo\b/i.test(document.body.innerText),
    }));
    if (res.sw > res.iw + 1) {
      throw new Error(`Overflow horizontal di ${label}: scrollWidth=${res.sw} > innerWidth=${res.iw}`);
    }
    if (res.hasForbiddenVendor) {
      throw new Error(`Teks vendor terlarang ditemukan di ${label}`);
    }
  }

  // 1. /pengaturan/metode-bayar
  await page.goto(`${BASE}/pengaturan/metode-bayar`, { waitUntil: 'networkidle' });
  await page.getByText('Menunggu gateway').first().waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /Tambah metode/i }).click();
  await page.locator('#pm-name').fill('EDC BCA Konter Kasir Utama');
  await page.locator('#pm-code').fill('EDC_BCA');
  await page.locator('#pm-pct').fill('1.5');
  await page.locator('#pm-fixed').fill('500');
  await page.locator('#pm-acc-name').fill('Bank BCA');
  await page.locator('#pm-note').fill('Dana masuk H+1 ke rekening operasional');
  await page.getByRole('button', { name: 'Simpan metode' }).click();
  await page.getByText('EDC BCA Konter Kasir Utama').first().waitFor({ timeout: 10000 });
  await page.getByText('potongan Rp 2.000').first().waitFor({ timeout: 10000 });

  for (const [w, h] of [[1440, 900], [1280, 800], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    await assertCleanPage(`metode-bayar-${w}`);
    await page.screenshot({ path: path.join(SHOTS_DIR, `a59-metode-bayar-${w}.png`) });
  }

  // 2. /order-online/pesanan — tab Status Kanal CG Order
  await page.goto(`${BASE}/order-online/pesanan`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Status Kanal' }).click();
  await page.getByText('CG Order QR Meja').first().waitFor({ timeout: 10000 });
  await page.getByTestId('cg-order-active-count').getByText('2 dari 5').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Aktifkan' }).first().click();
  await page.getByTestId('cg-order-active-count').getByText('3 dari 5').waitFor({ timeout: 10000 });

  for (const [w, h] of [[1440, 900], [1280, 800], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    await assertCleanPage(`order-online-kanal-${w}`);
    if (w === 1280 || w === 390) {
      await page.screenshot({ path: path.join(SHOTS_DIR, `a59-order-online-kanal-${w}.png`) });
    }
  }

  // 3. /order-online/mandiri — halaman spesifik saluran CG Order QR Meja
  await page.goto(`${BASE}/order-online/mandiri`, { waitUntil: 'networkidle' });
  await page.getByText('Kanal terpilih').first().waitFor({ timeout: 10000 });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(200);
  await assertCleanPage('order-online-mandiri-1280');
  await page.screenshot({ path: path.join(SHOTS_DIR, 'a59-order-online-mandiri-1280.png') });

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(`Console/Page errors ditemukan:\nConsole: ${consoleErrors.join('; ')}\nPage: ${pageErrors.join('; ')}`);
  }

  console.log('AUDIT A59 LULUS');
} finally {
  await browser.close();
  server.close();
}

