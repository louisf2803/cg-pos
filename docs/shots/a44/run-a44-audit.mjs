import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3033;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a44');

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
    const fallbackPath = path.join(STATIC_DIR, 'index.html');
    if (fs.existsSync(fallbackPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(fallbackPath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }
});

server.listen(PORT, async () => {
  console.log(`Server audit berjalan di http://localhost:${PORT}`);

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
  let totalOverflows = 0;

  try {
    for (const vp of viewports) {
      const consoleErrors = [];
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto(`http://localhost:${PORT}/pengaturan/stasiun-cetak`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);

      // Audit horizontal overflow on page
      const pageOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });

      if (pageOverflow) {
        console.error(`[OVERFLOW] stasiun-cetak at ${vp.name}px! scrollWidth > innerWidth`);
        totalOverflows++;
      }

      await page.screenshot({
        path: path.join(SHOTS_DIR, `stasiun-cetak-${vp.name}.png`),
        fullPage: true,
      });
      console.log(`[OK] stasiun-cetak-${vp.name}.png (overflow=${pageOverflow})`);

      // Open Edit Dialog for Dapur
      const editButton = page.locator('button[aria-label^="Ubah stasiun"]').first();
      if (await editButton.count() > 0) {
        await editButton.click();
        await page.waitForTimeout(300);

        // Check overflow inside dialog modal
        const dialogOverflow = await page.evaluate(() => {
          const dlg = document.querySelector('dialog');
          if (!dlg) return false;
          return dlg.scrollWidth > window.innerWidth + 1;
        });

        if (dialogOverflow) {
          console.error(`[MODAL OVERFLOW] dialog at ${vp.name}px! dlg.scrollWidth > innerWidth`);
          totalOverflows++;
        }

        await page.screenshot({
          path: path.join(SHOTS_DIR, `stasiun-cetak-modal-${vp.name}.png`),
          fullPage: false,
        });
        console.log(`[OK] stasiun-cetak-modal-${vp.name}.png (modalOverflow=${dialogOverflow})`);
      }

      if (consoleErrors.length > 0) {
        console.error(`[CONSOLE ERROR] at ${vp.name}px:`, consoleErrors);
        totalErrors += consoleErrors.length;
      }

      await page.close();
    }
  } catch (err) {
    console.error('Audit error:', err);
    totalErrors++;
  } finally {
    await browser.close();
    server.close();
    console.log(`Audit selesai. Total overflow: ${totalOverflows}, Total console errors: ${totalErrors}`);
    process.exit(totalErrors + totalOverflows > 0 ? 1 : 0);
  }
});

