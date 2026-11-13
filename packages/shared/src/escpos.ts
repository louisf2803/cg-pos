import { formatRp } from './money';
import { discountDisplayLabel } from './promo';
import { orderTypeLabel } from './report';
import { taxDisplay } from './outlet';
import { resolveReceiptTemplate, themeCols, type PrintTheme } from './receipt-template';
import type { Order, OutletContext } from './types';

/**
 * Pembuat byte ESC/POS untuk printer thermal umum (58 mm = 32 kolom, 80 mm = 48 kolom).
 * Murni (tanpa DOM/Bluetooth) supaya bisa diuji; pengiriman byte ada di aplikasi kasir.
 */
export type PaperWidth = '58' | '80';
export const paperCols = (p: PaperWidth) => (p === '58' ? 32 : 48);

const ESC = 0x1b;
const GS = 0x1d;

/** Printer thermal umumnya hanya paham ASCII; ubah huruf beraksen dan tanda khusus ke padanan terdekat. */
export function toPrinterText(s: string): string {
  return s
    .replace(/[  ]/g, ' ')
    .replace(/[×✕]/g, 'x').replace(/[·•]/g, '-').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

/** Pecah teks panjang menjadi baris selebar `cols` (memotong di spasi bila bisa). */
export function wrapText(s: string, cols: number): string[] {
  const out: string[] = [];
  for (const para of toPrinterText(s).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      let w = word;
      while (w.length > cols) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, cols)); w = w.slice(cols); }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= cols) line += ' ' + w;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

/** Kiri dan kanan dalam satu baris selebar `cols`; bila terlalu panjang, kanan turun ke baris sendiri. */
export function twoColumns(left: string, right: string, cols: number): string[] {
  const l = toPrinterText(left); const r = toPrinterText(right);
  if (l.length + 1 + r.length <= cols) return [l + ' '.repeat(cols - l.length - r.length) + r];
  const lines = wrapText(l, cols);
  return [...lines, ' '.repeat(Math.max(0, cols - r.length)) + r];
}

/** size: tema huruf (normal = biasa, medium = tinggi dua kali, large = lebar dan tinggi dua kali) */
export type Piece = { text: string; align?: 'left' | 'center'; bold?: boolean; big?: boolean; size?: PrintTheme };

/** Terapkan tema huruf ke semua potongan (normal tidak mengubah apa pun). */
export const withTheme = (pieces: Piece[], theme: PrintTheme): Piece[] => (theme === 'normal' ? pieces : pieces.map((pc) => ({ ...pc, size: theme })));

const fmtTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

/** Isi struk/tagihan sebagai potongan teks per baris, sama isinya dengan tampilan struk di layar. */
export function receiptPieces(o: { order: Order; ctx: OutletContext; cashierName: string; kind: 'receipt' | 'bill'; cols: number; printedAt?: string }): Piece[] {
  const { order, ctx, cashierName, kind } = o;
  const tpl = resolveReceiptTemplate(ctx);
  const cols = themeCols(o.cols, tpl.theme);
  const p: Piece[] = [];
  const dash = '-'.repeat(cols);
  const center = (t: string, bold = false) => { for (const l of wrapText(t, cols)) p.push({ text: l, align: 'center', bold }); };
  const row = (a: string, b: string, bold = false) => { for (const l of twoColumns(a, b, cols)) p.push({ text: l, bold }); };
  const text = (t: string) => { for (const l of wrapText(t, cols)) p.push({ text: l }); };

  if (tpl.showOutletName) center(ctx.outletName, true);
  if (tpl.showAddress && ctx.address) center(ctx.address);
  if (tpl.showPhone && ctx.phone) center(ctx.phone);
  if (ctx.receiptHeader) for (const l of ctx.receiptHeader.split('\n')) if (l.trim()) center(l.trim());
  p.push({ text: dash });
  row(kind === 'bill' ? 'TAGIHAN (belum lunas)' : 'STRUK', tpl.showOrderType ? orderTypeLabel(order.type) : '');
  if (tpl.showOrderNo) text(order.number);
  const meta = [tpl.showTable ? order.label : '', tpl.showGuests && order.guestCount ? `${order.guestCount} tamu` : ''].filter(Boolean).join(' - ');
  if (meta) text(meta);
  if (tpl.showTime) text(fmtTime(order.closedAt ?? order.openedAt, ctx.timezone));
  if (tpl.showCashier) text(`Kasir: ${cashierName}`);
  if (order.customerName && tpl.showCustomer) text(`Pelanggan: ${order.customerName}`);
  p.push({ text: dash });
  for (const i of order.items) {
    text(i.name);
    if (tpl.showUnitPrice) row(`${i.qty} x ${formatRp(i.unitPrice)}`, formatRp(i.qty * i.unitPrice));
    else row(`${i.qty} x`, formatRp(i.qty * i.unitPrice));
    if (tpl.showExtras) for (const e of i.extras ?? []) row(`+ ${e.name}${i.qty > 1 ? ` x ${i.qty}` : ''}`, e.price > 0 ? formatRp(e.price * i.qty) : '');
    if (tpl.showNotes && i.note) text(`  ${i.note}`);
  }
  p.push({ text: dash });
  const d = taxDisplay(order);
  row('Subtotal', formatRp(d.subtotal));
  if (d.discount > 0) {
    row('Potongan', `-${formatRp(d.discount)}`);
    for (const x of order.discounts ?? []) if (x.reference) text(`  ${discountDisplayLabel(x)}`);
  }
  if (order.serviceCharge > 0) row('Biaya layanan', formatRp(order.serviceCharge));
  if (d.tax > 0 && !d.inclusive) row('Pajak', formatRp(d.tax));
  if (order.rounding !== 0) row('Pembulatan', formatRp(order.rounding));
  row('TOTAL', formatRp(order.total), true);
  if (d.inclusive) row('Sudah termasuk pajak', formatRp(d.tax));
  if (kind === 'receipt') {
    p.push({ text: dash });
    for (const pay of order.payments) row(pay.methodName, formatRp(pay.amount));
    const last = order.payments[order.payments.length - 1];
    if (last && last.kind === 'cash' && last.change > 0) row('Kembalian', formatRp(last.change));
  } else if (order.paidTotal > 0) {
    row('Sudah dibayar', formatRp(order.paidTotal));
    row('Sisa', formatRp(order.total - order.paidTotal));
  }
  if (ctx.receiptFooter) { p.push({ text: dash }); center(ctx.receiptFooter); }
  if (tpl.showPrintTime) { if (!ctx.receiptFooter) p.push({ text: dash }); center(`dicetak ${fmtTime(o.printedAt ?? new Date().toISOString(), ctx.timezone)}`); }
  return withTheme(p, tpl.theme);
}

export interface EscposOptions { paper: PaperWidth; openDrawer?: boolean; cut?: boolean }

/** Ubah potongan teks menjadi byte ESC/POS: init, rata, tebal, potong kertas, dan (opsional) tendang laci kas. */
export function encodeEscpos(pieces: Piece[], opts: EscposOptions): Uint8Array {
  const b: number[] = [ESC, 0x40]; // reset printer
  const put = (s: string) => { for (const ch of s) b.push(ch.charCodeAt(0)); };
  let align: 'left' | 'center' = 'left';
  let bold = false;
  let size: PrintTheme = 'normal';
  for (const pc of pieces) {
    const a = pc.align ?? 'left';
    if (a !== align) { b.push(ESC, 0x61, a === 'center' ? 1 : 0); align = a; }
    const w = !!pc.bold;
    if (w !== bold) { b.push(ESC, 0x45, w ? 1 : 0); bold = w; }
    const sz = pc.size ?? 'normal';
    if (sz !== size) { b.push(GS, 0x21, sz === 'large' ? 0x11 : sz === 'medium' ? 0x01 : 0x00); size = sz; }
    put(toPrinterText(pc.text)); b.push(0x0a);
  }
  if (size !== 'normal') b.push(GS, 0x21, 0x00);
  if (bold) b.push(ESC, 0x45, 0);
  b.push(ESC, 0x61, 0);
  b.push(0x0a, 0x0a, 0x0a); // sisa kertas sebelum dipotong
  if (opts.cut !== false) b.push(GS, 0x56, 0x42, 0x00); // potong sebagian
  if (opts.openDrawer) b.push(...drawerKick());
  return Uint8Array.from(b);
}

/** Perintah tendang laci kas lewat port DK printer (pin 2, denyut 50 ms). */
export const drawerKick = (): number[] => [ESC, 0x70, 0x00, 0x19, 0xfa];

export function receiptBytes(o: { order: Order; ctx: OutletContext; cashierName: string; kind: 'receipt' | 'bill'; paper: PaperWidth; openDrawer?: boolean }): Uint8Array {
  return encodeEscpos(receiptPieces({ ...o, cols: paperCols(o.paper) }), { paper: o.paper, openDrawer: o.openDrawer });
}

/** Halaman uji: garis lebar penuh supaya kelihatan apakah lebar kertas sudah cocok. */
export function testPageBytes(paper: PaperWidth, outletName: string, openDrawer = false): Uint8Array {
  const cols = paperCols(paper);
  const pieces: Piece[] = [
    { text: outletName, align: 'center', bold: true },
    { text: 'Tes printer', align: 'center' },
    { text: '='.repeat(cols) },
    { text: `Lebar kertas ${paper} mm (${cols} kolom)` },
    { text: '0123456789'.repeat(5).slice(0, cols) },
    { text: 'Rp 12.345 x 2 ........ Rp 24.690' .slice(0, cols) },
    { text: '='.repeat(cols) },
    ...wrapText('Jika teks ini utuh dan tidak terpotong, printer siap.', cols).map((text) => ({ text, align: 'center' as const })),
  ];
  return encodeEscpos(pieces, { paper, openDrawer });
}
