import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/DELL/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3010;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/a27');

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

      // 1. Visit /laporan/karyawan
      console.log(`[${vp.name}px] Navigating to /laporan/karyawan...`);
      await page.goto(`http://localhost:${PORT}/laporan/karyawan`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      const overflowKaryawan = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`[${vp.name}px] /laporan/karyawan horizontal overflow: ${overflowKaryawan}px`);
      if (overflowKaryawan > 1) {
        throw new Error(`Horizontal overflow on /laporan/karyawan at ${vp.name}px: ${overflowKaryawan}px`);
      }

      await page.screenshot({ path: path.join(SHOTS_DIR, `laporan-karyawan-${vp.name}.png`), fullPage: true });

      // Check role labels in Indonesian (Kasir/Manajer/Pemilik)
      const pageContent = await page.content();
      if (pageContent.includes('Cashier') || pageContent.includes('Manager') || pageContent.includes('Owner')) {
        throw new Error(`English role detected in /laporan/karyawan at ${vp.name}px!`);
      }

      // Check search input placeholder distance
      const searchInput = page.locator('input[placeholder="Cari karyawan..."]');
      if (await searchInput.isVisible()) {
        const paddingLeft = await searchInput.evaluate((el) => window.getComputedStyle(el).paddingLeft);
        console.log(`[${vp.name}px] Search input paddingLeft: ${paddingLeft}`);
        if (paddingLeft !== '36px') {
          throw new Error(`Expected search paddingLeft to be 36px, got ${paddingLeft}`);
        }
      }

      // 2. Visit /laporan/dapur
      console.log(`[${vp.name}px] Navigating to /laporan/dapur...`);
      await page.goto(`http://localhost:${PORT}/laporan/dapur`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      const overflowDapur = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`[${vp.name}px] /laporan/dapur horizontal overflow: ${overflowDapur}px`);
      if (overflowDapur > 1) {
        throw new Error(`Horizontal overflow on /laporan/dapur at ${vp.name}px: ${overflowDapur}px`);
      }

      await page.screenshot({ path: path.join(SHOTS_DIR, `laporan-dapur-${vp.name}.png`), fullPage: true });

      // Verify on 390px that subtexts are not clipped with ellipsis (truncate)
      if (vp.name === '390') {
        const textOverflow = await page.evaluate(() => {
          const spans = Array.from(document.querySelectorAll('span'));
          const subtexts = spans.filter((s) => s.textContent.includes('Dari pesanan dikirim') || s.textContent.includes('Pesanan dibatalkan'));
          return subtexts.map((s) => ({
            text: s.textContent,
            hasTruncate: s.classList.contains('truncate'),
            textOverflow: window.getComputedStyle(s).textOverflow,
          }));
        });
        console.log(`[${vp.name}px] Subtext text-overflow check:`, textOverflow);
        for (const t of textOverflow) {
          if (t.hasTruncate || t.textOverflow === 'ellipsis') {
            throw new Error(`Subtext still has truncate or textOverflow ellipsis: ${t.text}`);
          }
        }
      }

      // 3. Visit /pengaturan/karyawan
      console.log(`[${vp.name}px] Navigating to /pengaturan/karyawan...`);
      await page.goto(`http://localhost:${PORT}/pengaturan/karyawan`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      const overflowPengaturan = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`[${vp.name}px] /pengaturan/karyawan horizontal overflow: ${overflowPengaturan}px`);
      if (overflowPengaturan > 1) {
        throw new Error(`Horizontal overflow on /pengaturan/karyawan at ${vp.name}px: ${overflowPengaturan}px`);
      }

      const searchPengaturan = page.locator('input[placeholder="Cari nama atau kode karyawan…"]');
      if (await searchPengaturan.isVisible()) {
        const paddingLeftPengaturan = await searchPengaturan.evaluate((el) => window.getComputedStyle(el).paddingLeft);
        console.log(`[${vp.name}px] Pengaturan search paddingLeft: ${paddingLeftPengaturan}`);
        if (paddingLeftPengaturan !== '36px') {
          throw new Error(`Expected pengaturan search paddingLeft to be 36px, got ${paddingLeftPengaturan}`);
        }
      }

      await page.screenshot({ path: path.join(SHOTS_DIR, `pengaturan-karyawan-${vp.name}.png`), fullPage: true });

      if (errors.length > 0) {
        console.error(`[${vp.name}px] Console errors:`, errors);
        throw new Error(`Console errors at ${vp.name}px: ${errors.join('; ')}`);
      }

      await context.close();
    }

    console.log('\nAll A27 Playwright checks passed successfully with 0 overflow and 0 console errors!');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('Audit run error:', err);
  process.exit(1);
});
