import { chromium } from 'file:///C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a61');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      let filePath = path.join(OUT_DIR, urlPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      } else if (!fs.existsSync(filePath)) {
        const withHtml = filePath + '.html';
        const withIdx = path.join(filePath, 'index.html');
        if (fs.existsSync(withHtml)) filePath = withHtml;
        else if (fs.existsSync(withIdx)) filePath = withIdx;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found: ' + urlPath);
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({ srv, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
}

async function checkNoOverflow(page, label) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  assert(sw <= cw, `Horizontal overflow on ${label}: scrollWidth=${sw} > clientWidth=${cw}`);
}

async function main() {
  const { srv, baseUrl } = await startStaticServer();
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  const consoleErrors = [];
  const pageErrors = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    const url = `${baseUrl}/karyawan/hak-akses/`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Pengaturan peran & hak akses');
    await checkNoOverflow(page, '1280 initial');

    // Scenario (c) & (d): Create temporary role with empty LIHAT
    await page.getByRole('button', { name: 'Tambah peran' }).first().click();
    await page.waitForSelector('[data-testid="wizard-panel-1"]');

    // Check (c): Akses Aplikasi Owner locked disabled + notice
    const ownerToggle = page.locator('[data-testid="owner-app-access-toggle"]');
    assert(await ownerToggle.isDisabled(), 'Akses Aplikasi Owner toggle must be disabled');
    await page.waitForSelector('text=Hanya Owner yang dapat merubah');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a61-step1-info-1280.png') });

    // Fill name for empty LIHAT test (d)
    await page.fill('#wizard-role-name', 'Peran Uji Kosong');
    await page.click('[data-testid="wizard-btn-next"]'); // -> Step 2
    await page.waitForSelector('[data-testid="wizard-panel-2"]');
    await page.click('[data-testid="wizard-btn-next"]'); // -> Step 3
    await page.waitForSelector('[data-testid="wizard-panel-3"]');
    await page.click('[data-testid="wizard-btn-next"]'); // -> Step 4
    await page.waitForSelector('[data-testid="wizard-panel-4"]');

    // Check (d): Halaman Awal disabled + empty hint
    const dashSelectEmpty = page.locator('[data-testid="default-dash-page-select"]');
    const posSelectEmpty = page.locator('[data-testid="default-pos-page-select"]');
    assert(await dashSelectEmpty.isDisabled(), 'Default dashboard page select should be disabled when no LIHAT enabled');
    assert(await posSelectEmpty.isDisabled(), 'Default POS page select should be disabled when POS disabled / no LIHAT');
    await page.waitForSelector('[data-testid="default-dash-empty-hint"]');
    await page.waitForSelector('[data-testid="default-pos-empty-hint"]');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a61-step4-empty-1280.png') });

    // Check (b): Click X -> confirm modal -> Batal -> stay in wizard -> Click X -> Ya, Lanjutkan -> discarded
    await page.click('[data-testid="wizard-close-x"]');
    await page.waitForSelector('[data-testid="wizard-exit-confirm-dialog"]');
    await page.waitForSelector('text=Membatalkan pengaturan Hak Akses akan menghilangkan perubahan yang telah dibuat dan tidak dapat dibatalkan. Lanjutkan?');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a61-exit-confirm-1280.png') });
    await page.click('[data-testid="confirm-exit-batal"]');
    await page.waitForSelector('[data-testid="wizard-panel-4"]');
    await page.click('[data-testid="wizard-close-x"]');
    await page.waitForSelector('[data-testid="wizard-exit-confirm-dialog"]');
    await page.click('[data-testid="confirm-exit-lanjutkan"]');
    await page.waitForTimeout(200);
    assert((await page.locator('text=Peran Uji Kosong').count()) === 0, 'Discarded role should not be saved');

    // Check (a): Full 4-step create "Kasir Senior"
    await page.getByRole('button', { name: 'Tambah peran' }).first().click();
    await page.waitForSelector('[data-testid="wizard-panel-1"]');
    await page.fill('#wizard-role-name', 'Kasir Senior');
    await page.fill('#wizard-role-desc', 'Menangani kasir utama, pembatalan, dan laporan penjualan harian');
    await page.click('[data-testid="wizard-btn-next"]'); // -> Step 2
    await page.waitForSelector('[data-testid="wizard-panel-2"]');

    // Open Detail Fitur on Produk and toggle LIHAT + BUAT
    await page.click('[data-testid="dashboard-detail-btn-dash-produk"]');
    await page.waitForSelector('[data-testid="feature-detail-dialog"]');
    await page.click('[data-testid="detail-cb-produk-katalog-lihat"]');
    await page.click('[data-testid="detail-cb-produk-katalog-buat"]');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a61-step2-detail-fitur-1280.png') });
    await page.click('[data-testid="detail-save-btn"]');
    await page.waitForSelector('[data-testid="wizard-panel-2"]');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a61-step2-dashboard-1280.png') });

    // Next -> Step 3 POS
    await page.click('[data-testid="wizard-btn-next"]');
    await page.waitForSelector('[data-testid="wizard-panel-3"]');
    await page.click('[data-testid="pos-app-master-toggle"]');
    await page.waitForSelector('[data-testid="pos-tab-pos-kasir"]');
    await page.click('[data-testid="pos-feat-toggle-pos-transaksi"]');

    // Verify POS Pengaturan locked ON
    await page.click('[data-testid="pos-tab-pos-pengaturan"]');
    const pengaturanToggle = page.locator('[data-testid="pos-mod-toggle-pos-pengaturan"]');
    assert(await pengaturanToggle.isDisabled(), 'POS Pengaturan module toggle must be disabled');
    assert((await pengaturanToggle.getAttribute('aria-checked')) === 'true', 'POS Pengaturan must stay ON');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a61-step3-pos-locked-1280.png') });

    // Next -> Step 4 Pengaturan Lainnya
    await page.click('[data-testid="wizard-btn-next"]');
    await page.waitForSelector('[data-testid="wizard-panel-4"]');
    await page.click('[data-testid="auth-void-toggle"]');

    const dashSel = page.locator('[data-testid="default-dash-page-select"]');
    const posSel = page.locator('[data-testid="default-pos-page-select"]');
    assert(!(await dashSel.isDisabled()), 'Default dashboard page should now be enabled');
    assert(!(await posSel.isDisabled()), 'Default POS page should now be enabled');
    await dashSel.selectOption('/produk');
    await posSel.selectOption('/pos');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a61-step4-filled-1280.png') });

    // Save ("Simpan")
    await page.click('[data-testid="wizard-btn-save"]');
    await page.waitForSelector('text=Kasir Senior');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a61-list-1280.png') });

    // Reload and verify persisted in localStorage
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('text=Kasir Senior');
    await page.waitForSelector('text=Otorisasi: Void');

    // Reopen edit on Kasir Senior and check Step 4 kept values
    await page.getByRole('button', { name: 'Ubah hak akses Kasir Senior' }).click();
    await page.waitForSelector('[data-testid="wizard-panel-1"]');
    await page.click('[data-testid="wizard-step-4"]');
    await page.waitForSelector('[data-testid="wizard-panel-4"]');
    assert((await page.locator('[data-testid="auth-void-toggle"]').getAttribute('aria-checked')) === 'true', 'Void authorization persisted');
    assert((await page.locator('[data-testid="default-dash-page-select"]').inputValue()) === '/produk', 'Default dash page persisted');
    assert((await page.locator('[data-testid="default-pos-page-select"]').inputValue()) === '/pos', 'Default POS page persisted');
    await page.click('[data-testid="wizard-close-x"]');
    await page.click('[data-testid="confirm-exit-lanjutkan"]');

    // Check 1440px viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
    await checkNoOverflow(page, '1440 list');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a61-list-1440.png') });

    // Check 390px mobile viewport (list + open wizard)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await checkNoOverflow(page, '390 list');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a61-list-390.png') });

    await page.locator('article').filter({ hasText: 'Kasir Senior' }).getByRole('button', { name: /Ubah/i }).click();
    await page.waitForSelector('[data-testid="wizard-panel-1"]');
    await checkNoOverflow(page, '390 wizard step 1');
    await page.click('[data-testid="wizard-step-2"]');
    await checkNoOverflow(page, '390 wizard step 2');
    await page.screenshot({ path: path.join(SHOTS_DIR, 'a61-wizard-390.png') });

    assert(consoleErrors.length === 0, 'Console errors: ' + consoleErrors.join(' | '));
    assert(pageErrors.length === 0, 'Page errors: ' + pageErrors.join(' | '));
    console.log('AUDIT A61 LULUS');
  } finally {
    await browser.close();
    srv.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
