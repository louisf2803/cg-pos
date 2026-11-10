import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3020;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a47');

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

      // Kunjungi layar tampilan struk
      await page.goto(`http://localhost:${PORT}/pengaturan/struk`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);

      // Verifikasi overflow horizontal
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      console.log(`[${vp.name}px] Horizontal overflow (Editor Struk): ${overflow ? 'ADA (GAGAL)' : 'NIHIL (LULUS)'}`);
      if (overflow) {
        totalErrors++;
        console.error(`ERROR: Terdeteksi horizontal scroll pada ${vp.name}px`);
      }

      // Verifikasi keberadaan elemen kunci
      const previewPaper = page.locator('[data-testid="receipt-preview-paper"]');
      const isPaperVisible = await previewPaper.isVisible();
      console.log(`[${vp.name}px] Pratinjau Kertas: visible=${isPaperVisible}`);
      if (!isPaperVisible) {
        totalErrors++;
        console.error(`ERROR: Pratinjau kertas struk tidak tampil pada ${vp.name}px`);
      }

      // Tangkapan layar awal (Tab Header)
      await page.screenshot({ path: path.join(SHOTS_DIR, `struk-editor-${vp.name}.png`), fullPage: false });
      console.log(`Tersimpan: struk-editor-${vp.name}.png`);

      if (vp.name === '1280') {
        // Uji pindah ke Tab Body
        const bodyTabBtn = page.locator('button[role="tab"]:has-text("Body")');
        await bodyTabBtn.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SHOTS_DIR, 'struk-editor-body-1280.png'), fullPage: false });
        console.log('Tersimpan: struk-editor-body-1280.png');

        // Uji pindah ke Tab Footer
        const footerTabBtn = page.locator('button[role="tab"]:has-text("Footer")');
        await footerTabBtn.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SHOTS_DIR, 'struk-editor-footer-1280.png'), fullPage: false });
        console.log('Tersimpan: struk-editor-footer-1280.png');

        // Kunjungi halaman /pengaturan/outlet untuk verifikasi tautan baru
        await page.goto(`http://localhost:${PORT}/pengaturan/outlet`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(SHOTS_DIR, 'outlet-link-1280.png'), fullPage: false });
        console.log('Tersimpan: outlet-link-1280.png');

        const strukLink = page.locator('a:has-text("Buka editor struk")');
        const hasStrukLink = await strukLink.isVisible();
        console.log(`[1280px] Tautan ke /pengaturan/struk di halaman outlet: visible=${hasStrukLink}`);
        if (!hasStrukLink) {
          totalErrors++;
          console.error('ERROR: Tautan ke /pengaturan/struk tidak ditemukan di halaman outlet');
        }
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
      console.error(`\nAudit A47 selesai dengan ${totalErrors} galat.`);
      process.exit(1);
    } else {
      console.log('\nAudit A47 LULUS SEMPURNA! Tanpa overflow horizontal dan tanpa galat konsol.');
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
