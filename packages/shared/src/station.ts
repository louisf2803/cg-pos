import { encodeEscpos, paperCols, twoColumns, withTheme, wrapText, type PaperWidth, type Piece } from './escpos';
import { themeCols, type PrintTheme } from './receipt-template';
import { orderTypeLabel } from './report';

/**
 * Stasiun cetak (Dapur, Bar, Label): produk dipetakan ke satu stasiun; pesanan yang disimpan atau dibayar
 * diteruskan otomatis dan kasir mencetak tiket (checker) per stasiun sesuai mode cetaknya.
 * Murni (tanpa DOM/Bluetooth/jaringan) supaya bisa diuji dan dipakai ulang untuk pratinjau di dashboard.
 */
export type StationKind = 'checker' | 'label';
/** auto = cetak langsung bila printer tersambung; ask = tawarkan tombol cetak; off = hanya layar dapur, tanpa cetak */
export type PrintMode = 'auto' | 'ask' | 'off';

export interface StationTemplate {
  /** judul di atas tiket, mis. DAPUR */
  title: string;
  /** teks di bawah tiket */
  footer: string;
  showOrderNo: boolean;
  showOrderType: boolean;
  showTable: boolean;
  showGuests: boolean;
  showCashier: boolean;
  showTime: boolean;
  showNotes: boolean;
  showExtras: boolean;
  /** nama item dicetak tebal */
  boldItems: boolean;
  /** garis pemisah antarbagian */
  separators: boolean;
  /** ukuran huruf tiket: normal, sedang (tinggi 2x), besar (lebar dan tinggi 2x) */
  theme: PrintTheme;
}

export interface PrintStation {
  id: string; name: string; kind: StationKind; printMode: PrintMode; copies: number; paper: PaperWidth;
  template: StationTemplate; sort: number; isActive: boolean;
}
export interface PrintStationInput {
  id?: string; name: string; kind?: StationKind; printMode?: PrintMode; copies?: number; paper?: PaperWidth;
  template?: Partial<StationTemplate>; sort?: number; isActive?: boolean;
}

/** Satu baris pesanan yang baru diteruskan ke sebuah stasiun. */
export interface SentLine { itemId: string; stationId: string; name: string; qty: number; note?: string; extras: { name: string; qty: number }[] }

export const STATION_NAME_MAX = 40;
export const STATION_TEXT_MAX = 60;
export const MAX_LABELS_PER_PRINT = 40;

export const PRINT_MODE_OPTIONS: { id: PrintMode; label: string; description: string }[] = [
  { id: 'auto', label: 'Otomatis', description: 'Cetak langsung bila printer tersambung' },
  { id: 'ask', label: 'Tanyakan', description: 'Tombol Cetak muncul di kasir' },
  { id: 'off', label: 'Mati', description: 'Hanya layar dapur, tanpa cetak' },
];

export const STATION_KIND_OPTIONS: { id: StationKind; label: string; description: string }[] = [
  { id: 'checker', label: 'Checker (Dapur / Bar)', description: 'Tiket satu rangkap per stasiun yang merangkum pesanan' },
  { id: 'label', label: 'Label (Cup / Kemasan)', description: 'Satu stiker per porsi produk untuk kemasan atau cup' },
];

export function printModeLabel(mode: PrintMode): string {
  const found = PRINT_MODE_OPTIONS.find((o) => o.id === mode);
  return found ? found.label : mode;
}

export function stationKindLabel(kind: StationKind): string {
  const found = STATION_KIND_OPTIONS.find((o) => o.id === kind);
  return found ? found.label : kind;
}

export function defaultTemplate(kind: StationKind = 'checker'): StationTemplate {
  return kind === 'label'
    ? { title: '', footer: '', showOrderNo: true, showOrderType: false, showTable: true, showGuests: false, showCashier: false, showTime: true, showNotes: true, showExtras: true, boldItems: true, separators: false, theme: 'normal' }
    : { title: '', footer: '', showOrderNo: true, showOrderType: true, showTable: true, showGuests: true, showCashier: true, showTime: true, showNotes: true, showExtras: true, boldItems: true, separators: true, theme: 'normal' };
}

const BOOLS = ['showOrderNo', 'showOrderType', 'showTable', 'showGuests', 'showCashier', 'showTime', 'showNotes', 'showExtras', 'boldItems', 'separators'] as const;

/** Isi bawaan untuk yang kosong, buang yang tidak dikenal, potong teks panjang. Aman untuk data mentah dari database. */
export function normalizeTemplate(raw: unknown, kind: StationKind = 'checker'): StationTemplate {
  const base = defaultTemplate(kind);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  const out: StationTemplate = { ...base };
  for (const k of BOOLS) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean;
  if (r.theme === 'normal' || r.theme === 'medium' || r.theme === 'large') out.theme = r.theme;
  if (typeof r.title === 'string') out.title = r.title.replace(/\s+/g, ' ').trim().slice(0, STATION_TEXT_MAX);
  if (typeof r.footer === 'string') out.footer = r.footer.replace(/\s+/g, ' ').trim().slice(0, STATION_TEXT_MAX);
  return out;
}

/** Pesan galat bahasa Indonesia, atau null bila sah. */
export function stationProblem(input: PrintStationInput): string | null {
  const name = (input.name ?? '').trim();
  if (!name) return 'Nama stasiun wajib diisi.';
  if (name.length > STATION_NAME_MAX) return `Nama stasiun maksimal ${STATION_NAME_MAX} huruf.`;
  if (input.kind !== undefined && input.kind !== 'checker' && input.kind !== 'label') return 'Jenis stasiun tidak dikenal.';
  if (input.printMode !== undefined && !['auto', 'ask', 'off'].includes(input.printMode)) return 'Mode cetak tidak dikenal.';
  if (input.copies !== undefined && (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > 5)) return 'Jumlah salinan harus 1 sampai 5.';
  if (input.paper !== undefined && input.paper !== '58' && input.paper !== '80') return 'Lebar kertas harus 58 atau 80 mm.';
  const t = input.template;
  if (t) {
    if (typeof t.title === 'string' && t.title.trim().length > STATION_TEXT_MAX) return `Judul tiket maksimal ${STATION_TEXT_MAX} huruf.`;
    if (typeof t.footer === 'string' && t.footer.trim().length > STATION_TEXT_MAX) return `Teks bawah tiket maksimal ${STATION_TEXT_MAX} huruf.`;
    if (t.theme !== undefined && t.theme !== 'normal' && t.theme !== 'medium' && t.theme !== 'large') return 'Ukuran huruf tiket tidak dikenal.';
  }
  return null;
}

/** Kelompokkan baris per stasiun aktif (urut stasiun); baris untuk stasiun yang tak dikenal dibuang. */
export function groupByStation(lines: SentLine[], stations: PrintStation[]): { station: PrintStation; lines: SentLine[] }[] {
  const out: { station: PrintStation; lines: SentLine[] }[] = [];
  for (const st of [...stations].filter((s) => s.isActive).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))) {
    const mine = lines.filter((l) => l.stationId === st.id);
    if (mine.length) out.push({ station: st, lines: mine });
  }
  return out;
}

/** Stasiun yang harus dicetak sekarang menurut mode cetaknya. */
export function printPlan(groups: { station: PrintStation; lines: SentLine[] }[]): { auto: typeof groups; ask: typeof groups } {
  return { auto: groups.filter((g) => g.station.printMode === 'auto'), ask: groups.filter((g) => g.station.printMode === 'ask') };
}

export interface TicketMeta { orderNumber: string; orderType: string; tableName?: string; label?: string; guestCount?: number; cashierName: string; at: string; timezone: string }

const fmtTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

/** Isi satu tiket checker sebagai potongan teks per baris (sama untuk layar, pratinjau dashboard, dan ESC/POS). */
export function checkerPieces(o: { station: Pick<PrintStation, 'name' | 'template'>; meta: TicketMeta; lines: SentLine[]; cols: number }): Piece[] {
  const { station, meta, lines } = o;
  const t = station.template;
  const cols = themeCols(o.cols, t.theme ?? 'normal');
  const p: Piece[] = [];
  const dash = '-'.repeat(cols);
  const sep = () => { if (t.separators) p.push({ text: dash }); };
  const center = (s: string, bold = false) => { for (const l of wrapText(s, cols)) p.push({ text: l, align: 'center', bold }); };
  const text = (s: string, bold = false) => { for (const l of wrapText(s, cols)) p.push({ text: l, bold }); };

  center((t.title || station.name).toUpperCase(), true);
  sep();
  if (t.showOrderNo) text(meta.orderNumber, true);
  const where = [t.showOrderType ? orderTypeLabel(meta.orderType) : '', t.showTable ? (meta.tableName ? `Meja ${meta.tableName}` : meta.label ?? '') : ''].filter(Boolean).join(' - ');
  if (where) text(where);
  if (t.showGuests && meta.guestCount) text(`${meta.guestCount} tamu`);
  if (t.showCashier && meta.cashierName) text(`Kasir: ${meta.cashierName}`);
  if (t.showTime) text(fmtTime(meta.at, meta.timezone));
  sep();
  for (const l of lines) {
    for (const row of twoColumns(`${l.qty} x ${l.name}`, '', cols)) p.push({ text: row.trimEnd(), bold: t.boldItems });
    if (t.showExtras) for (const e of l.extras) text(`  + ${e.name}${e.qty > 1 ? ` x ${e.qty}` : ''}`);
    if (t.showNotes && l.note) text(`  * ${l.note}`);
  }
  sep();
  if (t.footer) center(t.footer);
  return withTheme(p, t.theme ?? 'normal');
}

/** Satu stiker per porsi (jumlah 2 = dua stiker), maksimal MAX_LABELS_PER_PRINT. Tiap stiker = satu daftar potongan. */
export function labelPieceSets(o: { station: Pick<PrintStation, 'name' | 'template'>; meta: TicketMeta; lines: SentLine[]; cols: number }): Piece[][] {
  const { station, meta, lines } = o;
  const t = station.template;
  const cols = themeCols(o.cols, t.theme ?? 'normal');
  const sets: Piece[][] = [];
  const total = lines.reduce((s, l) => s + Math.max(1, Math.round(l.qty)), 0);
  let n = 0;
  for (const l of lines) {
    for (let k = 0; k < Math.max(1, Math.round(l.qty)); k++) {
      if (sets.length >= MAX_LABELS_PER_PRINT) return sets;
      n += 1;
      const p: Piece[] = [];
      const text = (s: string, bold = false) => { for (const x of wrapText(s, cols)) p.push({ text: x, bold }); };
      if (t.title) text(t.title.toUpperCase(), true);
      text(l.name, t.boldItems);
      if (t.showExtras) for (const e of l.extras) text(`+ ${e.name}`);
      if (t.showNotes && l.note) text(`* ${l.note}`);
      const meta2 = [t.showOrderNo ? meta.orderNumber.split('/').slice(-2).join('/') : '', t.showTable ? (meta.tableName ? `Meja ${meta.tableName}` : meta.label ?? '') : '', t.showTime ? fmtTime(meta.at, meta.timezone) : ''].filter(Boolean).join(' ');
      if (meta2) text(meta2);
      if (total > 1) text(`${n}/${total}`);
      if (t.footer) text(t.footer);
      sets.push(withTheme(p, t.theme ?? 'normal'));
    }
  }
  return sets;
}

/** Byte ESC/POS siap kirim ke printer: checker = satu tiket (diulang sebanyak salinan), label = satu stiker per porsi. */
export function stationBytes(o: { station: PrintStation; meta: TicketMeta; lines: SentLine[] }): Uint8Array {
  const { station } = o;
  const cols = paperCols(station.paper);
  const chunks: Uint8Array[] = [];
  if (station.kind === 'label') {
    for (let c = 0; c < station.copies; c++) for (const set of labelPieceSets({ ...o, cols })) chunks.push(encodeEscpos(set, { paper: station.paper }));
  } else {
    const one = encodeEscpos(checkerPieces({ ...o, cols }), { paper: station.paper });
    for (let c = 0; c < station.copies; c++) chunks.push(one);
  }
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/** Contoh isi untuk pratinjau template di dashboard (tanpa data pesanan nyata). */
export function sampleTicket(): { meta: TicketMeta; lines: SentLine[] } {
  return {
    meta: { orderNumber: 'OUT1/A/261110/012', orderType: 'dine_in', tableName: 'T4', guestCount: 3, cashierName: 'Sari', at: '2026-11-10T07:05:00Z', timezone: 'Asia/Jakarta' },
    lines: [
      { itemId: 's1', stationId: 's', name: 'Kopi susu gula aren', qty: 2, note: 'kurang manis', extras: [{ name: 'Extra shot', qty: 1 }] },
      { itemId: 's2', stationId: 's', name: 'Roti bakar cokelat keju', qty: 1, extras: [] },
    ],
  };
}
