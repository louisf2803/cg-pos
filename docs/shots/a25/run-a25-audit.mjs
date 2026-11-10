import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const PORT = 3025;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a25');

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
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  } else if (!fs.existsSync(filePath)) {
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
  console.log(`[TEST-A25] Dashboard static server running on http://localhost:${PORT}`);
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

    for (const [tag, vp] of [
      ['1280', { width: 1280, height: 800 }],
      ['1440', { width: 1440, height: 900 }],
      ['390', { width: 390, height: 844 }],
    ]) {
      console.log(`\n--- Pengujian Fitur A25 pada viewport ${tag} ---`);
      const ctx = await browser.newContext({ viewport: vp });
      const p = await ctx.newPage();
      p.on('console', (m) => {
        if (m.type() === 'error') errs.push(`${tag} console: ${m.text()}`);
      });
      p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));

      // 1. Audit /keuangan
      console.log(`${tag}: Menguji halaman /keuangan...`);
      await p.goto(`http://localhost:${PORT}/keuangan`);
      await p.waitForSelector('h1:has-text("Dashboard keuangan")');
      await p.waitForSelector('text=Laba Rugi');
      await p.waitForSelector('text=Arus Kas');
      await p.waitForSelector('text=Saldo Kas & Bank');
      await p.waitForSelector('text=Posisi Neraca');

      // Verifikasi label Aktiva tampil
      ok(await p.getByText('Aktiva', { exact: true }).isVisible(), `${tag}: label Aktiva tampil jelas menggantikan huruf A`);

      // Verifikasi kurva svg rendered
      const svgCount = await p.locator('svg[aria-label="Grafik perbandingan keuangan multi-garis"]').count();
      ok(svgCount >= 2, `${tag}: grafik SVG Laba Rugi dan Arus Kas tampil (${svgCount})`);

      await p.screenshot({ path: path.join(SHOTS_DIR, `keuangan-${tag}.png`) });

      const swKeuangan = await p.evaluate(() => document.documentElement.scrollWidth);
      ok(swKeuangan <= vp.width, `${tag}: /keuangan tanpa overflow horizontal (sw: ${swKeuangan} <= vp: ${vp.width})`);

      // 2. Audit /pengaturan/karyawan
      console.log(`${tag}: Menguji halaman /pengaturan/karyawan...`);
      await p.goto(`http://localhost:${PORT}/pengaturan/karyawan`);
      await p.waitForSelector('h1:has-text("Karyawan dan akses")');
      await p.waitForSelector('input[placeholder="Cari nama atau kode karyawan…"]');

      if (vp.width >= 768) {
        // Cek header Tindakan rata kanan
        const thAlign = await p.getByRole('columnheader', { name: 'Tindakan', exact: true }).evaluate((el) => window.getComputedStyle(el).textAlign);
        ok(thAlign === 'right', `${tag}: header Tindakan rata kanan`);

        // Cek tombol Ubah nonaktif untuk Pemilik
        ok(await p.locator('button[aria-label*="pemilik tidak dapat diubah"]').isVisible(), `${tag}: tombol Ubah nonaktif untuk Pemilik`);
        ok(await p.locator('button[aria-label*="pemilik tidak dapat dinonaktifkan"]').isVisible(), `${tag}: tombol Nonaktifkan nonaktif untuk Pemilik`);
      }

      await p.screenshot({ path: path.join(SHOTS_DIR, `karyawan-${tag}.png`) });

      const swKaryawan = await p.evaluate(() => document.documentElement.scrollWidth);
      ok(swKaryawan <= vp.width, `${tag}: /pengaturan/karyawan tanpa overflow horizontal (sw: ${swKaryawan} <= vp: ${vp.width})`);

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
  console.log(`\nAudit A25 selesai dengan ${fail} kegagalan.`);
  process.exit(fail ? 1 : 0);
});
