import { describe, expect, it } from 'vitest';
import {
  checkerPieces, defaultTemplate, groupByStation, labelPieceSets, normalizeTemplate, printPlan, sampleTicket, stationBytes, stationProblem,
  type PrintStation, type SentLine,
} from '../src';

const st = (over: Partial<PrintStation> = {}): PrintStation => ({
  id: 'd', name: 'Dapur', kind: 'checker', printMode: 'auto', copies: 1, paper: '58', template: defaultTemplate(), sort: 0, isActive: true, ...over,
});
const line = (id: string, stationId: string, name = 'Kopi', qty = 1, extra: Partial<SentLine> = {}): SentLine => ({ itemId: id, stationId, name, qty, extras: [], ...extra });

describe('normalizeTemplate', () => {
  it('memakai bawaan untuk masukan rusak', () => {
    expect(normalizeTemplate(null)).toEqual(defaultTemplate());
    expect(normalizeTemplate([1])).toEqual(defaultTemplate());
    expect(normalizeTemplate('x')).toEqual(defaultTemplate());
  });
  it('mengambil boolean sah, membuang yang tak dikenal, memotong dan merapikan teks', () => {
    const t = normalizeTemplate({ showCashier: false, showTable: 'ya', title: '  CHECKER   DAPUR ', footer: 'x'.repeat(200), aneh: 1 });
    expect(t.showCashier).toBe(false);
    expect(t.showTable).toBe(true);
    expect(t.title).toBe('CHECKER DAPUR');
    expect(t.footer).toHaveLength(60);
    expect('aneh' in t).toBe(false);
  });
  it('bawaan stiker berbeda dari checker', () => {
    expect(defaultTemplate('label').showCashier).toBe(false);
    expect(defaultTemplate('checker').showCashier).toBe(true);
  });
});

describe('stationProblem', () => {
  it('menolak nama kosong, terlalu panjang, nilai di luar batas', () => {
    expect(stationProblem({ name: '  ' })).toMatch(/wajib/);
    expect(stationProblem({ name: 'x'.repeat(41) })).toMatch(/maksimal 40/);
    expect(stationProblem({ name: 'Bar', copies: 0 })).toMatch(/1 sampai 5/);
    expect(stationProblem({ name: 'Bar', copies: 6 })).toMatch(/1 sampai 5/);
    expect(stationProblem({ name: 'Bar', copies: 1.5 })).toMatch(/1 sampai 5/);
    expect(stationProblem({ name: 'Bar', paper: '70' as never })).toMatch(/58 atau 80/);
    expect(stationProblem({ name: 'Bar', printMode: 'semua' as never })).toMatch(/Mode cetak/);
    expect(stationProblem({ name: 'Bar', template: { title: 'y'.repeat(61) } })).toMatch(/Judul/);
  });
  it('menerima masukan sah', () => {
    expect(stationProblem({ name: 'Bar', kind: 'label', printMode: 'ask', copies: 2, paper: '80', template: { footer: 'Terima kasih' } })).toBeNull();
  });
});

describe('groupByStation dan printPlan', () => {
  const d = st(); const b = st({ id: 'b', name: 'Bar', printMode: 'ask', sort: 1 }); const x = st({ id: 'x', name: 'Mati', isActive: false, sort: 2 });
  it('mengelompokkan per stasiun aktif, urut, membuang yang tak dikenal atau nonaktif', () => {
    const g = groupByStation([line('1', 'b'), line('2', 'd'), line('3', 'x'), line('4', 'zzz'), line('5', 'd')], [b, x, d]);
    expect(g.map((e) => [e.station.id, e.lines.map((l) => l.itemId)])).toEqual([['d', ['2', '5']], ['b', ['1']]]);
  });
  it('rencana cetak memisahkan auto dan ask, mengabaikan off', () => {
    const off = st({ id: 'o', name: 'Off', printMode: 'off', sort: 3 });
    const g = groupByStation([line('1', 'd'), line('2', 'b'), line('3', 'o')], [d, b, off]);
    const plan = printPlan(g);
    expect(plan.auto.map((e) => e.station.id)).toEqual(['d']);
    expect(plan.ask.map((e) => e.station.id)).toEqual(['b']);
  });
});

describe('checkerPieces', () => {
  const { meta } = sampleTicket();
  const lines = [line('1', 'd', 'Kopi susu gula aren', 2, { note: 'kurang manis', extras: [{ name: 'Extra shot', qty: 1 }] })];
  it('memuat judul, nomor, meja, tamu, kasir, jam, item, ekstra, catatan', () => {
    const txt = checkerPieces({ station: st(), meta, lines, cols: 32 }).map((p) => p.text).join('\n');
    expect(txt).toContain('DAPUR');
    expect(txt).toContain('OUT1/A/261110/012');
    expect(txt).toContain('Makan di tempat - Meja T4');
    expect(txt).toContain('3 tamu');
    expect(txt).toContain('Kasir: Sari');
    expect(txt).toContain('10/11, 14.05');
    expect(txt).toContain('2 x Kopi susu gula aren');
    expect(txt).toContain('+ Extra shot');
    expect(txt).toContain('* kurang manis');
  });
  it('mengikuti template: judul sendiri, bagian disembunyikan, tanpa garis', () => {
    const station = st({ template: { ...defaultTemplate(), title: 'checker bar', showCashier: false, showGuests: false, showNotes: false, showExtras: false, separators: false, footer: 'Siapkan cepat' } });
    const pieces = checkerPieces({ station, meta, lines, cols: 32 });
    const txt = pieces.map((p) => p.text).join('\n');
    expect(txt).toContain('CHECKER BAR');
    expect(txt).not.toContain('Kasir');
    expect(txt).not.toContain('tamu');
    expect(txt).not.toContain('kurang manis');
    expect(txt).not.toContain('Extra shot');
    expect(txt).not.toContain('--------');
    expect(txt).toContain('Siapkan cepat');
  });
  it('baris tidak melebihi lebar kolom', () => {
    const long = [line('1', 'd', 'Nasi goreng kampung spesial dengan telur mata sapi dan kerupuk udang', 1, { note: 'tanpa bawang goreng dan sambal dipisah ya' })];
    for (const cols of [32, 48]) for (const p of checkerPieces({ station: st(), meta, lines: long, cols })) expect(p.text.length).toBeLessThanOrEqual(cols);
  });
  it('tanpa nama judul memakai nama stasiun', () => {
    expect(checkerPieces({ station: st({ name: 'Bar' }), meta, lines, cols: 32 })[0]!.text).toBe('BAR');
  });
});

describe('labelPieceSets dan stationBytes', () => {
  const { meta } = sampleTicket();
  it('satu stiker per porsi dengan penomoran', () => {
    const sets = labelPieceSets({ station: st({ kind: 'label', template: defaultTemplate('label') }), meta, lines: [line('1', 'd', 'Kopi', 2, { note: 'es sedikit' }), line('2', 'd', 'Teh', 1)], cols: 32 });
    expect(sets).toHaveLength(3);
    expect(sets[0]!.map((p) => p.text).join(' ')).toContain('1/3');
    expect(sets[2]!.map((p) => p.text).join(' ')).toContain('3/3');
    expect(sets[0]!.map((p) => p.text).join(' ')).toContain('es sedikit');
  });
  it('dibatasi 40 stiker', () => {
    expect(labelPieceSets({ station: st({ kind: 'label' }), meta, lines: [line('1', 'd', 'Kopi', 100)], cols: 32 })).toHaveLength(40);
  });
  it('byte: checker diulang sesuai salinan, label per stiker; berawalan reset printer', () => {
    const one = stationBytes({ station: st(), meta, lines: [line('1', 'd')] });
    const two = stationBytes({ station: st({ copies: 2 }), meta, lines: [line('1', 'd')] });
    expect(two.length).toBe(one.length * 2);
    expect([one[0], one[1]]).toEqual([0x1b, 0x40]);
    const lab = stationBytes({ station: st({ kind: 'label', copies: 1 }), meta, lines: [line('1', 'd', 'Kopi', 3)] });
    expect(lab.filter((b, i) => b === 0x1b && lab[i + 1] === 0x40).length).toBe(3);
  });
});
