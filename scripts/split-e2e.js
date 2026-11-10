// Uji pisah bayar per item di mode demo: bagian terpilih dibayar, sisa tetap di keranjang lalu dibayar.
// Pakai: POS sudah dibangun dan dilayani di :4311; NODE_PATH=$(npm root -g) node scripts/split-e2e.js
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
    const box = p.getByPlaceholder(/scan SKU/);
    for (const sku of ['nk-001', 'nk-001', 'nk-002']) { await box.fill(sku); await box.press('Enter'); await p.waitForTimeout(150); }
    if (vp.width < 600) await p.click('button:has-text("Pesanan (")');
    await p.getByTestId('split-open').click();
    const dlg = p.getByTestId('split-dialog'); await dlg.waitFor();
    ok(await p.getByTestId('split-go').isDisabled(), `${tag}: tombol lanjut nonaktif sebelum memilih`);
    // pilih 1 dari baris pertama (Kopi susu x2)
    await dlg.getByRole('button', { name: /^Tambah .* yang dibayar/ }).first().click();
    const paidTxt = await p.getByTestId('split-paid').innerText(); const remTxt = await p.getByTestId('split-remain').innerText();
    ok(/17\.600/.test(paidTxt), `${tag}: bagian dibayar (1 Teh tarik 16.000 + PB1 10%) = ${paidTxt}`);
    ok(/41\.800/.test(remTxt), `${tag}: sisa (Teh tarik 16.000 + Cokelat panas 22.000 + PB1) = ${remTxt}`);
    // pilih semua -> galat
    for (const btn of await dlg.getByRole('button', { name: /^Tambah .* yang dibayar/ }).all()) { while (await btn.isEnabled()) await btn.click(); }
    await p.getByTestId('split-go').click();
    ok(/Semua item/.test(await p.getByTestId('split-err').innerText()), `${tag}: memilih semua ditolak dengan pesan`);
    // kembali ke 1 kopi saja
    for (const btn of await dlg.getByRole('button', { name: /^Kurangi .* yang dibayar/ }).all()) { while (await btn.isEnabled()) await btn.click(); }
    await dlg.getByRole('button', { name: /^Tambah .* yang dibayar/ }).first().click();
    await p.getByTestId('split-go').click();
    await p.getByRole('radio', { name: /Tunai/ }).click();
    await p.locator('.cg-chip', { hasText: 'Uang pas' }).click();
    const pay1 = await p.locator('body').innerText();
    ok(/17\.600/.test(pay1) && !/Cokelat/.test(pay1), `${tag}: layar bayar hanya memuat bagian terpilih`);
    await p.getByRole('button', { name: /^Terima/ }).click();
    await p.getByRole('button', { name: 'Pesanan baru' }).waitFor();
    await p.getByRole('button', { name: 'Pesanan baru' }).click();
    // sisa pesanan masih di keranjang
    if (vp.width < 600) { if (await p.locator('button:has-text("Pesanan (")').count()) await p.click('button:has-text("Pesanan (")'); }
    await p.waitForTimeout(300);
    const body = await p.locator('body').innerText();
    ok(/Cokelat panas/.test(body), `${tag}: sisa pesanan masih di keranjang`);
    const bayar = p.getByRole('button', { name: /^Bayar/ });
    const label = await bayar.first().getAttribute('aria-label');
    ok(/Bayar Rp\s?41\.800/.test(label), `${tag}: tombol bayar memuat sisa (${label})`);
    await bayar.first().click();
    await p.getByRole('radio', { name: /Tunai/ }).click(); await p.locator('.cg-chip', { hasText: 'Uang pas' }).click();
    await p.getByRole('button', { name: /^Terima/ }).click();
    await p.getByRole('button', { name: 'Pesanan baru' }).waitFor(); ok(true, `${tag}: sisa pesanan lunas`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth) <= vp.width, `${tag}: tanpa overflow horizontal`);
    await ctx.close();
  }
  ok(errs.length === 0, 'tanpa galat konsol' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); process.exit(fail ? 1 : 0);
})();
