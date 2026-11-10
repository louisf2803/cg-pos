// Uji mode tampilan kasir (kartu / daftar / SKU) di mode demo. Butuh POS dibangun dan dilayani di :4311.
const { chromium } = require('playwright');
const BASE = process.env.POS_URL || 'http://localhost:4311/';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'GAGAL ') + m); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const tag = String(vp.width);
    const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage();
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(BASE); await p.waitForSelector('text=Siapa yang bertugas');
    await p.click('text=Sari'); for (const d of '222222') await p.keyboard.press(d);
    await p.waitForSelector('h1:has-text("Buka kasir"), .cg-shell');
    if (await p.locator('h1:has-text("Buka kasir")').count()) { await p.click('button.cg-chip:has-text("100.000")'); await p.click('button:has-text("Buka kasir")'); }
    await p.waitForSelector('.cg-shell');
    const grid = p.locator('.cg-shell__grid');
    const cols = () => p.evaluate(() => getComputedStyle(document.querySelector('.cg-shell__grid')).gridTemplateColumns.split(' ').length);
    ok((await grid.getAttribute('data-view')) === 'grid', `${tag}: bawaan = kartu bergambar`);
    const gridCols = await cols();
    const setMode = async (label) => { await p.locator('header button[aria-label="Pengaturan perangkat"]').click(); await p.getByRole('radio', { name: new RegExp(label) }).check(); await p.getByRole('button', { name: 'Selesai' }).click(); await p.waitForTimeout(250); };
    await setMode('Daftar ringkas');
    ok((await cols()) === 1 && gridCols >= 2, `${tag}: daftar ringkas = 1 kolom (kartu ${gridCols} kolom)`);
    ok((await p.locator('.cg-tile').count()) > 5, `${tag}: semua produk tetap tampil di daftar`);
    await setMode('Mode SKU');
    ok((await p.getByTestId('sku-idle').count()) === 1 && (await p.locator('.cg-tile').count()) === 0, `${tag}: mode SKU kosong sampai mengetik/scan`);
    const box = p.getByPlaceholder(/scan SKU/);
    await box.fill('kopi'); ok((await p.locator('.cg-tile').count()) >= 1, `${tag}: mengetik nama menampilkan hasil`);
    await box.fill('nk-001'); await box.press('Enter');
    ok(/masuk pesanan/.test(await p.getByTestId('scan-msg').innerText()), `${tag}: SKU persis + Enter langsung masuk pesanan`);
    ok(await p.evaluate(() => JSON.parse(localStorage.getItem('cgpos.device')).viewMode) === 'sku', `${tag}: pilihan tersimpan di perangkat`);
    await p.reload(); await p.waitForSelector('text=Siapa yang bertugas').catch(() => {});
    ok(await p.evaluate(() => document.documentElement.scrollWidth) <= vp.width, `${tag}: tanpa overflow horizontal`);
    await ctx.close();
  }
  ok(errs.length === 0, 'tanpa galat konsol' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); process.exit(fail ? 1 : 0);
})();
