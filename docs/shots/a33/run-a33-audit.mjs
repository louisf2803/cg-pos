import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3016;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a33');

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
  '.txt': 'text/plain',
};

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(reqUrl.pathname);
  let filePath = path.join(STATIC_DIR, pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  } else if (!fs.existsSync(filePath) && fs.existsSync(path.join(filePath, 'index.html'))) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    if (pathname.includes('.') || pathname.startsWith('/_next/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } else {
      const fallback = path.join(STATIC_DIR, 'index.html');
      if (fs.existsSync(fallback)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(fallback).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    }
  }
});

async function run() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Static server running on http://localhost:${PORT}`);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '1280', width: 1280, height: 800 },
    { name: '390', width: 390, height: 844 },
  ];

  let totalErrors = 0;

  try {
    for (const vp of viewports) {
      console.log(`\n=================== Viewport: ${vp.name}px ===================`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();

      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const txt = msg.text();
          if (!txt.includes('favicon') && !txt.includes('404')) {
            errors.push(txt);
          }
        }
      });
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(`http://localhost:${PORT}/keuangan/buku-besar`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      // Verifikasi overflow horizontal
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      console.log(`[${vp.name}px] Horizontal overflow: ${overflow ? 'ADA (GAGAL)' : 'NIHIL (LULUS)'}`);
      if (overflow) {
        totalErrors++;
        console.error(`ERROR: Terdeteksi horizontal scroll pada ${vp.name}px`);
      }

      if (vp.name === '1440') {
        await page.screenshot({ path: path.join(SHOTS_DIR, 'buku-besar-single-1440.png'), fullPage: false });
        console.log('Tersimpan: buku-besar-single-1440.png');
      }

      if (vp.name === '1280') {
        // Buka pemilih akun
        const selectorBtn = page.locator('[data-testid="account-selector-btn"]');
        await selectorBtn.click();
        await page.waitForTimeout(400);

        await page.screenshot({ path: path.join(SHOTS_DIR, 'buku-besar-selector-1280.png'), fullPage: false });
        console.log('Tersimpan: buku-besar-selector-1280.png');

        // Klik "Pilih semua"
        const selectAllBtn = page.locator('button:has-text("Pilih semua")');
        if (await selectAllBtn.isVisible()) {
          await selectAllBtn.click();
          await page.waitForTimeout(300);
        }

        const doneBtn = page.locator('button:has-text("Selesai")');
        if (await doneBtn.isVisible()) {
          await doneBtn.click();
        } else {
          await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(800);

        // Screenshot multi akun
        await page.screenshot({ path: path.join(SHOTS_DIR, 'buku-besar-multi-1280.png'), fullPage: false });
        console.log('Tersimpan: buku-besar-multi-1280.png');
      }

      if (vp.name === '390') {
        // Pilih semua di mobile
        const selectorBtn = page.locator('[data-testid="account-selector-btn"]');
        await selectorBtn.click();
        await page.waitForTimeout(400);

        const selectAllBtn = page.locator('button:has-text("Pilih semua")');
        if (await selectAllBtn.isVisible()) {
          await selectAllBtn.click();
          await page.waitForTimeout(300);
        }

        const doneBtn = page.locator('button:has-text("Selesai")');
        if (await doneBtn.isVisible()) {
          await doneBtn.click();
        }
        await page.waitForTimeout(800);

        await page.screenshot({ path: path.join(SHOTS_DIR, 'buku-besar-multi-390.png'), fullPage: false });
        console.log('Tersimpan: buku-besar-multi-390.png');

        // Buka kembali pemilih dan kosongkan
        await selectorBtn.click();
        await page.waitForTimeout(400);
        const clearBtn = page.locator('button:has-text("Kosongkan")');
        if (await clearBtn.isVisible()) {
          await clearBtn.click();
          await page.waitForTimeout(300);
        }
        if (await doneBtn.isVisible()) {
          await doneBtn.click();
        }
        await page.waitForTimeout(500);

        await page.screenshot({ path: path.join(SHOTS_DIR, 'buku-besar-empty-390.png'), fullPage: false });
        console.log('Tersimpan: buku-besar-empty-390.png');
      }

      if (errors.length > 0) {
        console.error(`[${vp.name}px] Console errors:`, errors);
        totalErrors += errors.length;
      } else {
        console.log(`[${vp.name}px] Console errors: NIHIL (LULUS)`);
      }

      await context.close();
    }

    if (totalErrors > 0) {
      console.error(`\nAudit selesai dengan ${totalErrors} galat.`);
      process.exit(1);
    } else {
      console.log('\nAudit A33 LULUS SEMPURNA! Tanpa overflow horizontal dan tanpa galat konsol.');
    }
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
