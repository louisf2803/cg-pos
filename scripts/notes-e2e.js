// Uji catatan siap pakai di kasir (mode demo): ketuk pilihan menambah/melepas teks di catatan baris.
// Pakai: POS dibangun dan dilayani di :4311; NODE_PATH=$(npm root -g) node scripts/notes-e2e.js
const { chromium } = require('playwright');
const BASE = process.env.POS_URL || 'http://localhost:4311/';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'GAGAL ') + m); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const tag = String(vp.width);
    const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage();
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(BASE); await p.waitForSelector('text=Siapa yang bertugas');
    await p.click('text=Sari'); for (const d of '222222') await p.keyboard.press(d);
    await p.waitForSelector('h1:has-text("Buka kasir"), .cg-shell');
    if (await p.locator('h1:has-text("Buka kasir")').count()) { await p.click('button.cg-chip:has-text("100.000")'); await p.click('button:has-text("Buka kasir")'); }
    await p.waitForSelector('.cg-shell');
    const box = p.getByPlaceholder(/scan SKU/); await box.fill('nk-001'); await box.press('Enter'); await p.waitForTimeout(200);
    if (vp.width < 600) await p.click('button:has-text("Pesanan (")');
    await p.locator('.cg-shell__lines li, li:has-text("Kopi susu")').first().click();
    await p.getByRole('button', { name: '+ Catatan' }).first().click();
    const host = p.getByTestId('note-presets'); await host.waitFor();
    ok((await host.innerText()).includes('Level pedas'), `${tag}: kategori catatan tampil`);
    await host.getByRole('button', { name: 'Sedang' }).click();
    await host.getByRole('button', { name: 'Kurang manis' }).click();
    const input = p.getByPlaceholder('Catatan...');
    ok((await input.inputValue()) === 'Sedang, Kurang manis', `${tag}: ketukan mengisi catatan (${await input.inputValue()})`);
    ok(await input.evaluate((el) => document.activeElement === el), `${tag}: kolom catatan tetap fokus setelah mengetuk pilihan`);
    await host.getByRole('button', { name: 'Sedang' }).click();
    ok((await input.inputValue()) === 'Kurang manis', `${tag}: ketuk lagi melepas teks`);
    await p.screenshot({ path: `docs/shots/s131/catatan-${tag}.png` });
    ok(await p.evaluate(() => document.documentElement.scrollWidth) <= vp.width, `${tag}: tanpa overflow horizontal`);
    await input.press('Enter');
    ok(/Catatan: Kurang manis/.test(await p.locator('body').innerText()), `${tag}: catatan tampil di baris pesanan`);
    await ctx.close();
  }
  ok(errs.length === 0, 'tanpa galat konsol' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); process.exit(fail ? 1 : 0);
})();
