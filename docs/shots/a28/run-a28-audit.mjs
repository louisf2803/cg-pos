import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../apps/dashboard/out');
const SHOTS_DIR = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2': 'font/woff2',
};

function startServer(port = 4178) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = decodeURIComponent(req.url.split('?')[0]);
      if (reqPath === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (reqPath === '/') reqPath = '/index.html';

      let filePath = path.join(OUT_DIR, reqPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        const idx = path.join(filePath, 'index.html');
        if (fs.existsSync(idx)) filePath = idx;
      }

      if (!fs.existsSync(filePath)) {
        const htmlVer = filePath + '.html';
        if (fs.existsSync(htmlVer)) {
          filePath = htmlVer;
        } else if (reqPath.startsWith('/_next/') || path.extname(reqPath)) {
          console.log('[404 Not Found]', req.url, 'looked for:', filePath);
          res.writeHead(404);
          res.end('Not found');
          return;
        } else {
          filePath = path.join(OUT_DIR, 'index.html');
        }
      }

      const ext = path.extname(filePath);
      const mime = MIME[ext] || 'application/octet-stream';

      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          const idx = path.join(filePath, 'index.html');
          if (fs.existsSync(idx)) {
            filePath = idx;
          } else {
            res.writeHead(404);
            res.end('Directory without index.html');
            return;
          }
        }
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': mime });
        res.end(content);
      } catch (err) {
        console.error('SERVER ERROR for', req.url, 'filePath:', filePath, err.message);
        res.writeHead(500);
        res.end(String(err));
      }
    });

    server.listen(port, () => resolve(server));
  });
}

async function audit() {
  const PORT = 4178;
  const server = await startServer(PORT);
  console.log(`Static server running on http://localhost:${PORT}`);

  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
  });
  const viewports = [
    { name: '1440px', width: 1440, height: 900 },
    { name: '1280px', width: 1280, height: 800 },
    { name: '390px',  width: 390,  height: 844 },
  ];

  const routes = [
    { path: '/analisa/waktu-teramai-penjualan', label: 'waktu-teramai-penjualan' },
    { path: '/analisa/perputaran-stok', label: 'perputaran-stok' },
    { path: '/analisa/waktu-teramai-produk', label: 'waktu-teramai-produk' },
  ];

  let hasErrors = false;

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    for (const route of routes) {
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      const url = `http://localhost:${PORT}${route.path}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      // Wait for data to render (table or empty state)
      try {
        await page.waitForSelector('table, .cg-empty', { timeout: 5000 });
      } catch (e) {
        console.log(`Note: table or cg-empty not detected within 5s on ${route.label}`);
      }
      await page.waitForTimeout(600);

      // Check overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      if (overflow) {
        console.error(`[OVERFLOW ERROR] ${route.label} has horizontal overflow at ${vp.name}!`);
        hasErrors = true;
      } else {
        console.log(`[PASS] ${route.label} at ${vp.name}: 0 horizontal overflow`);
      }

      if (consoleErrors.length > 0) {
        console.error(`[CONSOLE ERRORS] ${route.label} at ${vp.name}:`, consoleErrors);
        hasErrors = true;
      } else {
        console.log(`[PASS] ${route.label} at ${vp.name}: 0 console errors`);
      }

      // Check heatmap width specifically on waktu-teramai-penjualan at 1280 & 1440
      if (route.label === 'waktu-teramai-penjualan' && (vp.name === '1440px' || vp.name === '1280px')) {
        const heatmapFit = await page.evaluate(() => {
          const tableContainer = document.querySelector('table[aria-label*="heatmap"]')?.parentElement;
          if (!tableContainer) return { found: false };
          const table = tableContainer.querySelector('table');
          return {
            found: true,
            containerWidth: tableContainer.clientWidth,
            tableWidth: table.scrollWidth,
            fitsWithoutScroll: table.scrollWidth <= tableContainer.clientWidth + 1,
          };
        });
        console.log(`[HEATMAP CHECK] ${vp.name}:`, heatmapFit);
        if (heatmapFit.found && !heatmapFit.fitsWithoutScroll) {
          console.error(`[HEATMAP WARNING] Heatmap table width (${heatmapFit.tableWidth}px) exceeds container (${heatmapFit.containerWidth}px) at ${vp.name}`);
        }
      }

      // Capture screenshot
      const shotPath = path.join(SHOTS_DIR, `${route.label}-${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`Saved screenshot: ${shotPath}`);

      // Interactive check on desktop for metric toggle & cell click
      if (route.label === 'waktu-teramai-penjualan' && vp.name === '1280px') {
        const nominalBtn = page.locator('button[role="tab"]:has-text("Nominal")');
        if (await nominalBtn.isVisible()) {
          await nominalBtn.click();
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(SHOTS_DIR, `${route.label}-nominal-active-1280px.png`) });
          console.log('Saved nominal active screenshot');
        }

        // Click a cell to show info bar
        const activeCell = page.locator('table[aria-label*="heatmap"] td div[role="button"]').first();
        if (await activeCell.isVisible()) {
          await activeCell.click();
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(SHOTS_DIR, `${route.label}-cell-selected-1280px.png`) });
          console.log('Saved cell selected screenshot');
        }
      }
    }

    await context.close();
  }

  await browser.close();
  server.close();

  if (hasErrors) {
    console.error('Audit failed with errors!');
    process.exit(1);
  } else {
    console.log('All audits PASSED cleanly!');
  }
}

audit();
