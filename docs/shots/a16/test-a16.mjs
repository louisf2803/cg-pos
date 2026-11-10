import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const PORT = 3394;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a16');

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
  '.txt': 'text/plain',
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  let filePath = path.join(STATIC_DIR, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    const notFound = path.join(STATIC_DIR, '404.html');
    if (fs.existsSync(notFound)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      fs.createReadStream(notFound).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
});

const VIEWPORTS = [
  { name: '390px', width: 390, height: 844 },
  { name: '1280px', width: 1280, height: 800 },
  { name: '1440px', width: 1440, height: 900 },
];

server.listen(PORT, async () => {
  console.log(`[TEST-A16] Static server running on http://localhost:${PORT}`);
  let browser;
  let exitCode = 0;
  const auditResults = [];

  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(`http://localhost:${PORT}/pengaturan/karyawan`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      // Check overflow
      const overflow = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientW = window.innerWidth;
        return {
          scrollW,
          clientW,
          hasOverflow: scrollW > clientW,
        };
      });

      const shotPath = path.join(SHOTS_DIR, `karyawan-${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      auditResults.push({
        viewport: vp.name,
        overflow: overflow.hasOverflow,
        consoleErrors: errors.length,
        file: `karyawan-${vp.name}.png`,
      });

      console.log(
        `[CAPTURE] karyawan @ ${vp.name}: overflow=${overflow.hasOverflow} (${overflow.scrollW}px / ${overflow.clientW}px), errors=${errors.length}`
      );

      await context.close();
    }

    // Interaction test: Ringkasan Outlet Modal and Atur PIN dialog at 1280px
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`http://localhost:${PORT}/pengaturan/karyawan`, { waitUntil: 'networkidle' });

      // Click Ringkasan outlet
      const outletBtn = page.locator('button:has-text("Ringkasan outlet")');
      await outletBtn.click();
      await page.waitForTimeout(200);

      const outletModal = page.locator('div[role="dialog"]');
      await outletModal.waitFor({ state: 'visible', timeout: 3000 });
      await page.screenshot({ path: path.join(SHOTS_DIR, 'karyawan-ringkasan-outlet-1280px.png') });
      console.log('[CAPTURE] Captured ringkasan outlet modal at 1280px');

      // Close modal
      const closeBtn = page.locator('button:has-text("Tutup")');
      await closeBtn.click();
      await outletModal.waitFor({ state: 'detached', timeout: 3000 });

      // Click Atur PIN button on first active employee
      const pinBtn = page.locator('button:has-text("Atur PIN")').first();
      await pinBtn.click();
      await page.waitForTimeout(200);

      const pinDialog = page.locator('dialog[aria-labelledby="judul-pin"]');
      await pinDialog.waitFor({ state: 'visible', timeout: 3000 });
      await page.screenshot({ path: path.join(SHOTS_DIR, 'karyawan-atur-pin-dialog-1280px.png') });
      console.log('[CAPTURE] Captured atur PIN dialog at 1280px');

      await context.close();
    }

    console.log('\n=== AUDIT RESULTS SUMMARY ===');
    let anyOverflow = false;
    let anyErrors = false;
    for (const res of auditResults) {
      if (res.overflow) anyOverflow = true;
      if (res.consoleErrors > 0) anyErrors = true;
      console.log(`- ${res.viewport}: Overflow=${res.overflow}, Errors=${res.consoleErrors}`);
    }

    if (anyOverflow || anyErrors) {
      console.error('[TEST-A16] FAILED!');
      exitCode = 1;
    } else {
      console.log('[TEST-A16] ALL TESTS PASSED! 0 overflow, 0 console errors.');
    }
  } catch (err) {
    console.error('[TEST-A16] Fatal error:', err);
    exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
    process.exit(exitCode);
  }
});

