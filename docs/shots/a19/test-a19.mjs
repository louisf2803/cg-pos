import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const PORT = 3397;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a19');

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

server.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  let totalErrors = 0;

  const viewports = [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ];

  try {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      const consoleErrors = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
      });

      console.log(`\nNavigating to /keuangan/biaya at ${vp.width}x${vp.height}...`);
      await page.goto(`http://localhost:${PORT}/keuangan/biaya`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Verify no horizontal overflow
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
        const clientWidth = Math.max(doc.clientWidth, body.clientWidth);
        return {
          hasOverflow: scrollWidth > clientWidth,
          scrollWidth,
          clientWidth,
        };
      });

      if (overflow.hasOverflow) {
        console.error(`[FAIL] /keuangan/biaya (${vp.width}px): Horizontal overflow detected! scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`);
        totalErrors++;
      } else {
        console.log(`[PASS] /keuangan/biaya (${vp.width}px): No horizontal overflow (${overflow.scrollWidth} <= ${overflow.clientWidth})`);
      }

      if (consoleErrors.length > 0) {
        console.error(`[FAIL] /keuangan/biaya (${vp.width}px): Console errors detected:`, consoleErrors);
        totalErrors += consoleErrors.length;
      } else {
        console.log(`[PASS] /keuangan/biaya (${vp.width}px): 0 console errors`);
      }

      const shotPath = path.join(SHOTS_DIR, `biaya-pengeluaran-${vp.width}px.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`[SHOT] Saved ${shotPath}`);

      // At 1280px, test tab switch and modal dialog
      if (vp.width === 1280) {
        // Switch tab to Penerimaan
        console.log('Testing tab switch to Penerimaan...');
        await page.click('button[role="tab"]:has-text("Penerimaan")');
        await page.waitForTimeout(300);
        const shotPenerimaan = path.join(SHOTS_DIR, `biaya-penerimaan-1280px.png`);
        await page.screenshot({ path: shotPenerimaan, fullPage: true });
        console.log(`[SHOT] Saved ${shotPenerimaan}`);

        // Open Dialog
        console.log('Testing open modal dialog...');
        await page.click('button:has-text("Catat penerimaan")');
        await page.waitForTimeout(300);
        const shotDialog = path.join(SHOTS_DIR, `biaya-dialog-1280px.png`);
        await page.screenshot({ path: shotDialog, fullPage: true });
        console.log(`[SHOT] Saved ${shotDialog}`);
      }

      await context.close();
    }

    if (totalErrors === 0) {
      console.log('\n==========================================');
      console.log('SEMUA AUDIT PLAYWRIGHT A19 BERHASIL LOLOS!');
      console.log('==========================================\n');
    } else {
      console.error(`\nTERDAPAT ${totalErrors} KESALAHAN PADA AUDIT PLAYWRIGHT!\n`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Playwright execution error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
