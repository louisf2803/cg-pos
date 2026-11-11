// Audit visual untuk S142: Lebar Kertas Bawaan (/pengaturan/struk).
// Jalan di lingkungan Linux dengan Playwright+Chromium bawaan (lihat environment Claude).
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = 4321;
const STATIC_DIR = path.resolve('apps/dashboard/out');
const SHOTS_DIR = path.resolve('docs/shots/s142');
const ROUTE = '/pengaturan/struk/';

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  let p = decodeURIComponent(reqUrl.pathname);
  let fp = path.join(STATIC_DIR, p);
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  else if (!fs.existsSync(fp) && fs.existsSync(fp + '.html')) fp += '.html';
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  } else { res.writeHead(404); res.end('404'); }
});

await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch();
const errors = [];
let horizOverflow = {};

for (const width of [390, 1280, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`${width}px: ${msg.text()}`); });
  page.on('pageerror', (e) => errors.push(`${width}px pageerror: ${e.message}`));
  await page.goto(`http://localhost:${PORT}${ROUTE}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Lebar Kertas Bawaan', { timeout: 10000 });
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  horizOverflow[width] = scrollWidth > width;
  await page.screenshot({ path: path.join(SHOTS_DIR, `${width}.png`), fullPage: true });
  // uji klik chip 58mm lalu 80mm (default) tanpa menyimpan
  await page.getByRole('button', { name: '58 mm', exact: true }).first().click();
  await page.screenshot({ path: path.join(SHOTS_DIR, `${width}-pilih-58.png`), fullPage: false });
  await page.close();
}

await browser.close();
await new Promise((r) => server.close(r));

console.log('Overflow horizontal per lebar:', horizOverflow);
console.log('Galat konsol:', errors.length ? errors : 'tidak ada');
if (errors.length || Object.values(horizOverflow).some(Boolean)) process.exit(1);
