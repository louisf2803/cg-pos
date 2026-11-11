import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const OUT_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a57');
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
      clientWidth: doc.clientWidth,
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  try {
    // Sign in on / if fake auth session needed? Check how dashboard fake mode works:
    // Fake mode auto-authenticates! Let's visit /pelanggan/grup directly.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseUrl}/pelanggan/grup`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Grup pelanggan');

    // Add group with long name
    await page.getByRole('button', { name: 'Tambah grup', exact: true }).click();
    const longGroupName =
      'Reseller Grosir Kafe & Kedai Kopi Nusantara Wilayah Jabodetabek Selatan 2026';
    await page.getByLabel('Nama grup *').fill(longGroupName);
    await page.getByLabel('Keterangan singkat').fill('Grup khusus mitra dengan pembelian karton.');
    await page.getByRole('button', { name: 'Simpan grup' }).click();
    await page.waitForSelector(`text=${longGroupName}`);

    // Open Kelola Anggota for new group and assign first customer
    const firstRow = page.locator('tr', { hasText: longGroupName });
    await firstRow.getByRole('button', { name: 'Kelola anggota' }).click();
    await page.waitForSelector('text=Kelola anggota:');
    const assignBtns = page.locator('dialog').getByRole('button', { name: /Masukkan|Pindahkan ke sini/ });
    if ((await assignBtns.count()) > 0) {
      await assignBtns.first().click();
    }
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a57-grup-members-1280.png') });
    await page.getByRole('button', { name: 'Selesai' }).click();

    // Reload and verify persistence
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector(`text=${longGroupName}`);
    await assertNoOverflowAndConsole(page, '/pelanggan/grup @ 1280', consoleErrors);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a57-grup-1280.png') });

    // Check 390px and 1440px
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoOverflowAndConsole(page, '/pelanggan/grup @ 390', consoleErrors);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a57-grup-390.png') });

    await page.setViewportSize({ width: 1440, height: 900 });
    await assertNoOverflowAndConsole(page, '/pelanggan/grup @ 1440', consoleErrors);

    // Check empty state for groups cleanly via localStorage = [] then restore
    const savedGroups = await page.evaluate(() => localStorage.getItem('cg-a57-customer-groups'));
    await page.evaluate(() => localStorage.setItem('cg-a57-customer-groups', '[]'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('text=Belum ada grup pelanggan');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a57-grup-empty-1280.png') });
    await page.evaluate((raw) => localStorage.setItem('cg-a57-customer-groups', raw || '[]'), savedGroups);

    // 2. /pelanggan/harga-spesial
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseUrl}/pelanggan/harga-spesial`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Grup harga spesial');
    await page.waitForSelector('text=Belum ada harga grosir');

    await page.getByRole('button', { name: /Atur harga grosir produk|Tambah produk bertingkat/ }).first().click();
    await page.waitForSelector('text=Atur harga grosir bertingkat');

    // Select first product with price >= Rp 15.000 for clean tier testing
    const pickedValue = await page.locator('#tier-product option').evaluateAll((opts) => {
      for (const opt of opts) {
        const m = (opt.textContent || '').match(/Rp\s*([\d.]+)/);
        if (m) {
          const val = Number(m[1].replace(/\./g, ''));
          if (val >= 15000) return opt.value;
        }
      }
      return opts[0]?.value || '';
    });
    if (pickedValue) await page.locator('#tier-product').selectOption(pickedValue);

    // Trigger validation error deliberately (tier 2 >= tier 1 price)
    await page.getByLabel('Harga per unit tingkat 1').fill('12000');
    await page.getByLabel('Harga per unit tingkat 2').fill('13000');
    await page.waitForSelector('text=harus lebih rendah');

    // Fix valid 3 tiers: >=5 -> 12000, >=12 -> 10500, >=24 -> 9000
    await page.getByLabel('Qty minimum tingkat 1').fill('5');
    await page.getByLabel('Harga per unit tingkat 1').fill('12000');
    await page.getByLabel('Qty minimum tingkat 2').fill('12');
    await page.getByLabel('Harga per unit tingkat 2').fill('10500');
    await page.getByRole('button', { name: 'Tambah tingkat' }).click();
    await page.getByLabel('Qty minimum tingkat 3').fill('24');
    await page.getByLabel('Harga per unit tingkat 3').fill('9000');
    await page.getByLabel('Simulasi perhitungan jumlah beli:').fill('12');
    await page.waitForSelector('text=Tingkat 2');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a57-harga-spesial-modal-1280.png') });

    await page.getByRole('button', { name: 'Simpan harga bertingkat' }).click();
    await page.waitForSelector('text=T3: ≥24');

    // Reload and verify persistence
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('text=T3: ≥24');
    await assertNoOverflowAndConsole(page, '/pelanggan/harga-spesial @ 1280', consoleErrors);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a57-harga-spesial-1280.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoOverflowAndConsole(page, '/pelanggan/harga-spesial @ 390', consoleErrors);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a57-harga-spesial-390.png') });

    await page.setViewportSize({ width: 1440, height: 900 });
    await assertNoOverflowAndConsole(page, '/pelanggan/harga-spesial @ 1440', consoleErrors);

    // 3. /harga-jadwal
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseUrl}/harga-jadwal`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Penjadwalan harga');
    await page.waitForSelector('text=Belum ada jadwal perubahan harga');

    // Create active schedule (started 1h ago, ends in 5h)
    const now = Date.now();
    const toLocalStr = (ms) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date(ms));
      const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      return `${m.year}-${m.month}-${m.day}T${m.hour === '24' ? '00' : m.hour}:${m.minute}`;
    };

    await page.getByRole('button', { name: /Buat jadwal pertama|Buat jadwal harga/ }).first().click();
    await page.getByLabel('Harga terjadwal (Rp) *').fill('19000');
    await page.getByLabel('Tanggal & jam mulai berlaku *').fill(toLocalStr(now - 3600_000));
    await page.getByLabel('Tanggal & jam berakhir (opsional)').fill(toLocalStr(now + 18000_000));
    await page.getByLabel('Alasan / catatan jadwal').fill('Promo siang aktif');
    await page.getByRole('button', { name: 'Simpan jadwal' }).click();
    await page.waitForSelector('text=Prioritas aktif');

    // Add an expired schedule too
    await page.getByRole('button', { name: 'Buat jadwal harga' }).click();
    await page.getByLabel('Harga terjadwal (Rp) *').fill('15000');
    await page.getByLabel('Tanggal & jam mulai berlaku *').fill(toLocalStr(now - 172800_000));
    await page.getByLabel('Tanggal & jam berakhir (opsional)').fill(toLocalStr(now - 86400_000));
    await page.getByLabel('Alasan / catatan jadwal').fill('Promo kemarin berakhir');
    await page.getByRole('button', { name: 'Simpan jadwal' }).click();
    await page.waitForSelector('text=Sudah lewat');

    // Reload and verify persistence
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('text=Promo siang aktif');
    await assertNoOverflowAndConsole(page, '/harga-jadwal @ 1280', consoleErrors);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a57-harga-jadwal-1280.png') });

    await page.setViewportSize({ width: 1440, height: 900 });
    await assertNoOverflowAndConsole(page, '/harga-jadwal @ 1440', consoleErrors);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a57-harga-jadwal-1440.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoOverflowAndConsole(page, '/harga-jadwal @ 390', consoleErrors);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a57-harga-jadwal-390.png') });

    console.log('AUDIT A57 LULUS');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

