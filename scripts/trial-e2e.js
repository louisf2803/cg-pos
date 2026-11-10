// Uji alur trial end-to-end di mode demo: buka shift → pesan → item bebas → bayar tunai → struk → kas keluar → tutup shift.
// Jalankan: pnpm -F @cgpos/pos build && python3 -m http.server 4311 --directory apps/pos/dist &  lalu  NODE_PATH=$(npm root -g) node scripts/trial-e2e.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = []; let fail = 0;
  const ok = (c, m) => { console.log(c ? 'OK  ' : 'GAGAL', m); if (!c) fail++; };
  for (const [tag, vp] of [['1280', { width: 1280, height: 800 }], ['390', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag}: ${m.text()}`); });
    p.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
    await p.goto(process.env.POS_URL || 'http://localhost:4311/');
    await p.waitForSelector('text=Siapa yang bertugas');
    await p.click('text=Sari'); for (const d of '222222') await p.keyboard.press(d);
    await p.waitForSelector('h1:has-text("Buka kasir"), .cg-shell');
    if (await p.locator('h1:has-text("Buka kasir")').count()) { await p.click('button.cg-chip:has-text("100.000")'); await p.click('button:has-text("Buka kasir")'); }
    await p.waitForSelector('.cg-shell'); ok(true, `${tag}: shift dibuka`);
    const box = p.getByPlaceholder(/scan SKU/); await box.fill('nk-001'); await box.press('Enter');
    await p.getByTestId('custom-open').click();
    await p.getByTestId('custom-name').fill('Jasa antar'); await p.getByTestId('custom-price').fill('10000'); await p.getByTestId('custom-add').click();
    await p.getByRole('dialog').waitFor({ state: 'detached' });
    if (vp.width < 600 && await p.locator('button:has-text("Pesanan (")').count()) await p.click('button:has-text("Pesanan (")');
    ok(/Jasa antar/.test(await p.locator('body').innerText()), `${tag}: item bebas masuk pesanan`);
    await p.getByRole('button', { name: /^Bayar/ }).click();
    await p.getByRole('radio', { name: /Tunai/ }).click();
    await p.locator('.cg-chip', { hasText: 'Uang pas' }).click();
    await p.getByRole('button', { name: /^Terima/ }).click();
    await p.getByRole('button', { name: 'Pesanan baru' }).waitFor();
    ok(true, `${tag}: pembayaran tunai lunas, struk tampil`);
    await p.getByRole('button', { name: 'Pesanan baru' }).click();
    await p.getByRole('button', { name: 'Shift', exact: true }).click();
    await p.getByTestId('cash-out-open').click(); await p.getByTestId('cash-amount').fill('5000'); await p.getByTestId('cash-reason').fill('Beli es batu'); await p.getByTestId('cash-save').click();
    await p.getByTestId('cash-list').waitFor(); ok(/Beli es batu/.test(await p.getByTestId('cash-list').innerText()), `${tag}: kas keluar tercatat`);
    await p.getByRole('button', { name: /Tutup kasir/ }).click();
    await p.locator('#hitung').fill('105000'); await p.getByRole('button', { name: 'Tutup kasir', exact: true }).click();
    await p.locator('#pin-tutup').fill('222222'); await p.getByRole('button', { name: 'Ya, tutup' }).click();
    await p.getByRole('heading', { name: 'Kasir ditutup' }).waitFor(); ok(true, `${tag}: shift ditutup dengan ringkasan`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth) <= vp.width, `${tag}: tanpa overflow horizontal`);
    await ctx.close();
  }
  ok(errs.length === 0, 'tanpa galat konsol' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); process.exit(fail ? 1 : 0);
})();
