import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3021;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a37');

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

      // 1. Visit /laporan/jasa (Initial / Empty state)
      await page.goto(`http://localhost:${PORT}/laporan/jasa`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);

      // Verify horizontal overflow (empty state)
      const overflowEmpty = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      console.log(`[${vp.name}px] Horizontal overflow (Empty State): ${overflowEmpty ? 'ADA (GAGAL)' : 'NIHIL (LULUS)'}`);
      if (overflowEmpty) {
        totalErrors++;
        console.error(`ERROR: Terdeteksi horizontal scroll pada ${vp.name}px (Empty State)`);
      }

      await page.screenshot({
        path: path.join(SHOTS_DIR, `laporan-jasa-empty-${vp.name}.png`),
        fullPage: false,
      });
      console.log(`Tersimpan: laporan-jasa-empty-${vp.name}.png`);

      // 2. Seed data via __cgpos_data
      await page.evaluate(async () => {
        const d = window.__cgpos_data;
        if (!d) return;

        const prods = await d.listProducts({ includeInactive: true });
        let srv1 = prods.find((p) => p.sku === 'JS-001');
        if (!srv1) {
          srv1 = await d.saveProduct({
            name: 'Jasa Servis & Cuci Sepatu',
            sku: 'JS-001',
            price: 45000,
            kind: 'service',
            trackStock: false,
            isActive: true,
          });
        }

        let srv2 = prods.find((p) => p.sku === 'JS-002');
        if (!srv2) {
          srv2 = await d.saveProduct({
            name: 'Reparasi Resleting & Jahit',
            sku: 'JS-002',
            price: 35000,
            kind: 'service',
            trackStock: false,
            isActive: true,
          });
        }

        let srv3 = prods.find((p) => p.sku === 'JS-003');
        if (!srv3) {
          srv3 = await d.saveProduct({
            name: 'Paket Treatment Deep Clean',
            sku: 'JS-003',
            price: 80000,
            kind: 'service',
            trackStock: false,
            isActive: true,
          });
        }

        let curShift = await d.currentShift();
        if (!curShift) {
          curShift = await d.openShift({
            id: 'shift-a37-test',
            cashierId: 'e-sari',
            openingCash: 100000,
          });
        }

        const order1 = await d.saveOrder(
          {
            id: `ord-srv-1-${Date.now()}`,
            type: 'takeaway',
            items: [
              {
                id: 'it-1',
                productId: srv1.id,
                name: srv1.name,
                qty: 2,
                unitPrice: srv1.price,
              },
              {
                id: 'it-2',
                productId: srv2.id,
                name: srv2.name,
                qty: 1,
                unitPrice: srv2.price,
              },
            ],
          },
          'e-sari'
        );

        await d.addPayment(order1.id, {
          id: `pay-1-${Date.now()}`,
          methodId: 'm-cash',
          amount: order1.total,
          tendered: order1.total,
        });

        const order2 = await d.saveOrder(
          {
            id: `ord-srv-2-${Date.now()}`,
            type: 'dine_in',
            items: [
              {
                id: 'it-3',
                productId: srv3.id,
                name: srv3.name,
                qty: 2,
                unitPrice: srv3.price,
              },
            ],
          },
          'e-sari'
        );

        await d.addPayment(order2.id, {
          id: `pay-2-${Date.now()}`,
          methodId: 'm-qris',
          amount: order2.total,
        });

        const order3 = await d.saveOrder(
          {
            id: `ord-srv-3-${Date.now()}`,
            type: 'takeaway',
            items: [
              {
                id: 'it-4',
                productId: srv1.id,
                name: srv1.name,
                qty: 4,
                unitPrice: srv1.price,
              },
            ],
          },
          'e-sari'
        );

        await d.addPayment(order3.id, {
          id: `pay-3-${Date.now()}`,
          methodId: 'm-cash',
          amount: order3.total,
          tendered: order3.total,
        });
      });

      // Refresh data in-memory without reloading page
      await page.evaluate(async () => {
        if (window.__cgpos_refresh) {
          window.__cgpos_refresh();
        }
      });
      await page.waitForTimeout(1000);

      // Verify horizontal overflow (populated state)
      const overflowPopulated = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      console.log(`[${vp.name}px] Horizontal overflow (Populated State): ${overflowPopulated ? 'ADA (GAGAL)' : 'NIHIL (LULUS)'}`);
      if (overflowPopulated) {
        totalErrors++;
        console.error(`ERROR: Terdeteksi horizontal scroll pada ${vp.name}px (Populated State)`);
      }

      // Verify key elements
      const kpiRev = await page.locator('[data-testid="kpi-total-revenue"]').isVisible();
      const kpiTx = await page.locator('[data-testid="kpi-total-transactions"]').isVisible();
      const kpiTop = await page.locator('[data-testid="kpi-top-service"]').isVisible();
      const chartVisible = await page.locator('svg[aria-label="Grafik batang penjualan jasa harian"]').isVisible();
      const tableVisible = await page.locator('table[aria-label="Tabel per jasa"]').isVisible();

      console.log(`[${vp.name}px] Elemen kunci: KPI Rev=${kpiRev}, KPI Tx=${kpiTx}, Top=${kpiTop}, Chart=${chartVisible}, Table=${tableVisible}`);

      if (!kpiRev || !kpiTx || !kpiTop || !chartVisible || !tableVisible) {
        totalErrors++;
        console.error(`ERROR: Komponen laporan jasa tidak tampil lengkap pada ${vp.name}px`);
      }

      // Save screenshot
      await page.screenshot({
        path: path.join(SHOTS_DIR, `laporan-jasa-populated-${vp.name}.png`),
        fullPage: true,
      });
      console.log(`Tersimpan: laporan-jasa-populated-${vp.name}.png`);

      // Test CSV download button
      const downloadBtn = page.locator('button:has-text("Unduh CSV")');
      const isDownloadEnabled = await downloadBtn.isEnabled();
      console.log(`[${vp.name}px] Tombol Unduh CSV enabled: ${isDownloadEnabled}`);
      if (!isDownloadEnabled) {
        totalErrors++;
        console.error(`ERROR: Tombol Unduh CSV tidak aktif saat ada data pada ${vp.name}px`);
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
      console.log('\nAudit A37 LULUS SEMPURNA! Tanpa overflow horizontal dan tanpa galat konsol.');
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
