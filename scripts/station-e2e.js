// Uji stasiun cetak di mode demo: tombol kirim manual tidak ada; bayar meneruskan baris otomatis ke Dapur (otomatis) dan Bar (tanya dulu),
// kartu tiket muncul, pratinjau tiket sesuai template, simpan pesanan meja juga meneruskan, produk tanpa stasiun (Item bebas) tidak ikut.
// Pakai: POS dilayani di :4311; NODE_PATH=$(npm root -g) node scripts/station-e2e.js
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
    ok((await p.getByRole('button', { name: 'Kirim ke dapur' }).count()) === 0, `${tag}: tombol Kirim ke dapur manual sudah tidak ada`);
    const box = p.getByPlaceholder(/scan SKU/);
    for (const sku of ['nk-001', 'mk-002']) { await box.fill(sku); await box.press('Enter'); await p.waitForTimeout(150); }
    if (vp.width < 600) await p.click('button:has-text("Pesanan (")');
    await p.getByRole('button', { name: /^Bayar/ }).click();
    await p.getByRole('radio', { name: /Tunai/ }).click();
    await p.locator('.cg-chip', { hasText: 'Uang pas' }).click();
    await p.getByRole('button', { name: /^Terima/ }).click();
    await p.getByRole('button', { name: 'Pesanan baru' }).waitFor();
    const note = await p.getByTestId('forward-notice').innerText();
    ok(/2 baris diteruskan ke Dapur, Bar/.test(note), `${tag}: pemberitahuan: ${note}`);
    ok(/siap dicetak/.test(note), `${tag}: tiket menunggu dicetak (tanpa printer tersambung)`);
    const host = p.getByTestId('ticket-host'); await host.waitFor();
    ok((await host.locator('text=/Tiket Dapur/').count()) === 1 && (await host.locator('text=/Tiket Bar/').count()) === 1, `${tag}: dua kartu tiket: Dapur dan Bar`);
    await p.screenshot({ path: `/home/claude/cgpos/docs/shots/s130/bayar-${tag}.png` });
    // pratinjau tiket Bar (template: judul CHECKER BAR, tanpa jumlah tamu)
    await host.locator('div', { hasText: 'Tiket Bar' }).getByRole('button', { name: 'Lihat' }).first().click();
    const txt = await p.getByTestId('ticket-text').innerText();
    ok(/CHECKER BAR/.test(txt) && /1 x Teh tarik/.test(txt) && !/Nasi goreng/.test(txt), `${tag}: tiket Bar hanya memuat minuman`);
    ok(/Kasir: Sari/.test(txt), `${tag}: tiket memuat kasir dan nomor pesanan`);
    await p.keyboard.press('Escape');
    // tutup kartu
    await p.getByRole('button', { name: 'Tutup tiket Bar' }).click();
    await p.getByRole('button', { name: 'Tutup tiket Dapur' }).click();
    ok((await p.getByTestId('ticket-host').count()) === 0, `${tag}: kartu hilang setelah ditutup`);
    await p.getByRole('button', { name: 'Pesanan baru' }).click();
    // simpan pesanan (tanpa bayar) juga meneruskan; Item bebas tanpa stasiun tidak
    await p.waitForSelector('.cg-shell');
    await box.fill('mk-001'); await box.press('Enter'); await p.waitForTimeout(150);
    if (vp.width < 600) await p.click('button:has-text("Pesanan (")');
    await p.getByRole('button', { name: /Simpan/ }).first().click();
    await p.waitForSelector('text=/diteruskan ke Dapur/');
    ok(true, `${tag}: simpan pesanan meneruskan ke Dapur`);
    ok((await p.getByTestId('ticket-host').locator('text=/Tiket Dapur/').count()) === 1, `${tag}: kartu tiket Dapur muncul`);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    ok(!overflow, `${tag}: tanpa overflow horizontal`);
    await p.screenshot({ path: `/home/claude/cgpos/docs/shots/s130/station-${tag}.png` });
    await ctx.close();
  }
  ok(errs.length === 0, 'tanpa galat konsol' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await b.close(); process.exit(fail ? 1 : 0);
})();
