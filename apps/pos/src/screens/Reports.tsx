import { useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { formatRp, posSalesRange, type CashMovement, type Order, type OutletContext, type PosRangePreset, type Refund, type SalesSummary, type ShiftReportRow } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';

type Category = 'ringkasan' | 'produk' | 'bayar' | 'void' | 'kasir' | 'kas' | 'lainnya';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'ringkasan', label: 'Ringkasan Penjualan' },
  { id: 'produk', label: 'Produk Terjual' },
  { id: 'bayar', label: 'Jenis Bayar' },
  { id: 'void', label: 'Void' },
  { id: 'kasir', label: 'Kasir' },
  { id: 'kas', label: 'Kas Kasir' },
  { id: 'lainnya', label: 'Lainnya' },
];
const RANGES: { id: PosRangePreset; label: string }[] = [
  { id: 'today', label: 'Hari ini' },
  { id: '7d', label: '7 hari' },
  { id: '30d', label: '30 hari' },
];

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(2).replace('.', ',')}%` : '0%');

interface ReportData {
  summary: SalesSummary; refunds: Refund[]; voids: Order[]; shifts: ShiftReportRow[]; cash: CashMovement[];
}

/** Laporan di kasir: kategori di kiri, isi di kanan. Data dari DataLayer yang sama dengan dashboard, dibatasi outlet ini. */
export function Reports({ ctx, onClose }: { ctx: OutletContext; onClose: () => void }) {
  const data = useData();
  const [cat, setCat] = useState<Category>('ringkasan');
  const [preset, setPreset] = useState<PosRangePreset>('today');
  const range = useMemo(() => posSalesRange(ctx.timezone, preset), [ctx.timezone, preset]);

  const load = useAsync<ReportData>(async () => {
    const [summary, refunds, voids, shifts, shift] = await Promise.all([
      data.salesSummary(range),
      data.listRefundsBetween(range),
      data.listOrders({ status: 'void', from: range.from, to: range.to, by: 'closed', limit: 200 }),
      data.listShiftReports(range),
      data.currentShift(),
    ]);
    const cash = shift ? await data.listCashMovements(shift.id) : [];
    return { summary, refunds, voids, shifts, cash };
  }, [data, range.from, range.to]);

  const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('id-ID', { timeZone: ctx.timezone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');

  return (
    <div className="flex flex-col h-full bg-surface min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-12 px-16 py-12 bg-surface-raised border-b border-border shrink-0">
        <div className="flex items-center gap-12 min-w-0">
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose} aria-label="Kembali">
            <ArrowLeft className="cg-icon cg-icon--sm" aria-hidden />
            <span className="hidden tablet:inline">Kembali</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-text leading-tight truncate">Laporan · {CATEGORIES.find((c) => c.id === cat)!.label}</h1>
            <p className="text-xs text-text-muted truncate">{ctx.outletName} · {range.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-8 shrink-0">
          <div className="flex items-center gap-6" role="group" aria-label="Rentang waktu">
            {RANGES.map((r) => (
              <button key={r.id} type="button" className="cg-chip" aria-pressed={preset === r.id} onClick={() => setPreset(r.id)}>{r.label}</button>
            ))}
          </div>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => load.reload()} aria-label="Perbarui">
            <RefreshCw className={`cg-icon cg-icon--sm ${load.status === 'loading' ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col tablet:flex-row">
        <nav className="tablet:w-[220px] shrink-0 border-b tablet:border-b-0 tablet:border-r border-border bg-surface-raised overflow-x-auto tablet:overflow-y-auto" aria-label="Kategori laporan">
          <ul className="flex tablet:flex-col p-8 gap-4">
            {CATEGORIES.map((c) => (
              <li key={c.id} className="shrink-0">
                <button type="button" className="cg-rail-item w-full whitespace-nowrap" aria-current={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 min-w-0 overflow-y-auto p-16">
          {load.status === 'loading' && <div className="cg-skeleton h-[160px]" aria-busy="true" />}
          {load.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert">{load.message}</div>}
          {load.status === 'ready' && <ReportBody cat={cat} d={load.data} fmtTime={fmtTime} />}
        </main>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-md p-12 bg-surface-raised min-w-0">
      <p className="text-xs text-text-muted truncate">{label}</p>
      <p className="text-base font-bold cg-num truncate">{value}</p>
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="cg-empty">
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-text-muted">{hint}</p>
    </div>
  );
}

function ReportBody({ cat, d, fmtTime }: { cat: Category; d: ReportData; fmtTime: (iso?: string) => string }) {
  const s = d.summary;
  const received = s.byMethod.reduce((n, m) => n + m.amount, 0);
  const refundTotal = d.refunds.reduce((n, r) => n + r.total, 0);

  if (cat === 'ringkasan') {
    const maxHour = Math.max(1, ...s.byHour.map((h) => h.total));
    return (
      <div className="space-y-16 min-w-0">
        <div className="grid grid-cols-2 laptop:grid-cols-4 gap-8">
          <Kpi label="Total penjualan" value={formatRp(s.total)} />
          <Kpi label="Total transaksi" value={String(s.orderCount)} />
          <Kpi label="Terima pembayaran" value={formatRp(received)} />
          <Kpi label="Refund" value={formatRp(refundTotal)} />
          <Kpi label="Rata-rata per transaksi" value={formatRp(s.avgTicket)} />
          <Kpi label="Diskon" value={formatRp(s.discounts)} />
          <Kpi label="Pajak" value={formatRp(s.tax)} />
          <Kpi label="Biaya layanan" value={formatRp(s.serviceCharge)} />
        </div>
        <section aria-label="Penjualan per jam">
          <h2 className="text-sm font-semibold mb-8">Penjualan per jam</h2>
          {s.byHour.length === 0 ? <Empty title="Belum ada penjualan" hint="Grafik tampil setelah ada transaksi lunas pada rentang ini." /> : (
            <div className="flex items-end gap-4 h-[160px] border-b border-border" role="img" aria-label="Grafik batang penjualan per jam">
              {s.byHour.map((h) => (
                <div key={h.hour} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
                  <div className="w-full rounded-sm bg-accent" style={{ height: `${Math.max(4, (h.total / maxHour) * 100)}%` }} title={`${String(h.hour).padStart(2, '0')}.00 · ${formatRp(h.total)} · ${h.count} transaksi`} />
                  <span className="text-[10px] text-text-muted mt-4">{String(h.hour).padStart(2, '0')}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (cat === 'produk') {
    return s.topProducts.length === 0 ? <Empty title="Belum ada produk terjual" hint="Daftar tampil setelah ada transaksi lunas." /> : (
      <div className="cg-data-wrap"><table className="cg-data"><thead><tr><th>Produk</th><th className="text-right">Jumlah</th><th className="text-right">Nilai</th></tr></thead>
        <tbody>{s.topProducts.map((p) => <tr key={p.productId}><td>{p.name}</td><td className="text-right cg-num">{p.qty}</td><td className="text-right cg-num">{formatRp(p.amount)}</td></tr>)}</tbody></table></div>
    );
  }

  if (cat === 'bayar') {
    const count = s.orderCount;
    return (
      <div className="space-y-12 min-w-0">
        <div className="grid grid-cols-3 gap-8"><Kpi label="Total transaksi" value={String(count)} /><Kpi label="Total penjualan" value={formatRp(received)} /><Kpi label="Jenis pembayaran" value={String(s.byMethod.length)} /></div>
        {s.byMethod.length === 0 ? <Empty title="Belum ada pembayaran" hint="Rincian per metode tampil setelah ada transaksi lunas." /> : (
          <div className="cg-data-wrap"><table className="cg-data"><thead><tr><th>Jenis pembayaran</th><th className="text-right">Transaksi</th><th className="text-right">% transaksi</th><th className="text-right">Penjualan</th><th className="text-right">% penjualan</th></tr></thead>
            <tbody>{s.byMethod.map((m) => <tr key={m.methodName}><td>{m.methodName}</td><td className="text-right cg-num">{m.count}</td><td className="text-right cg-num">{pct(m.count, count)}</td><td className="text-right cg-num">{formatRp(m.amount)}</td><td className="text-right cg-num">{pct(m.amount, received)}</td></tr>)}</tbody></table></div>
        )}
      </div>
    );
  }

  if (cat === 'void') {
    return (
      <div className="space-y-12 min-w-0">
        <div className="grid grid-cols-2 gap-8"><Kpi label="Total void" value={formatRp(d.voids.reduce((n, o) => n + o.total, 0))} /><Kpi label="Jumlah transaksi" value={String(d.voids.length)} /></div>
        {d.voids.length === 0 ? <Empty title="Tidak ada void" hint="Pesanan yang dibatalkan sebelum dibayar tampil di sini." /> : (
          <div className="cg-data-wrap"><table className="cg-data"><thead><tr><th>No nota</th><th>Waktu void</th><th>Waktu order</th><th className="text-right">Total</th></tr></thead>
            <tbody>{d.voids.map((o) => <tr key={o.id}><td>{o.number}</td><td>{fmtTime(o.closedAt)}</td><td>{fmtTime(o.openedAt)}</td><td className="text-right cg-num">{formatRp(o.total)}</td></tr>)}</tbody></table></div>
        )}
      </div>
    );
  }

  if (cat === 'kasir') {
    return d.shifts.length === 0 ? <Empty title="Belum ada kasir dibuka" hint="Riwayat buka dan tutup kasir tampil di sini." /> : (
      <div className="cg-data-wrap"><table className="cg-data"><thead><tr><th>Waktu buka</th><th className="text-right">Saldo awal</th><th>Kasir</th><th>Waktu tutup</th><th className="text-right">Saldo akhir</th></tr></thead>
        <tbody>{d.shifts.map((r) => <tr key={r.shift.id}><td>{fmtTime(r.shift.openedAt)}</td><td className="text-right cg-num">{formatRp(r.shift.openingCash)}</td><td>{r.cashierName}</td><td>{fmtTime(r.shift.closedAt)}</td><td className="text-right cg-num">{r.shift.status === 'closed' ? formatRp(r.counted) : '-'}</td></tr>)}</tbody></table></div>
    );
  }

  if (cat === 'kas') {
    const kasIn = d.cash.filter((c) => c.kind === 'in').reduce((n, c) => n + c.amount, 0);
    const kasOut = d.cash.filter((c) => c.kind === 'out').reduce((n, c) => n + c.amount, 0);
    return (
      <div className="space-y-12 min-w-0">
        <p className="text-sm text-text-muted">Kas masuk dan keluar pada kasir yang sedang dibuka.</p>
        <div className="grid grid-cols-2 laptop:grid-cols-3 gap-8"><Kpi label="Pemasukan" value={formatRp(kasIn)} /><Kpi label="Pengeluaran" value={formatRp(kasOut)} /><Kpi label="Selisih kas" value={formatRp(kasIn - kasOut)} /></div>
        {d.cash.length === 0 ? <Empty title="Belum ada kas masuk atau keluar" hint="Tambah lewat tombol Shift di layar kasir." /> : (
          <div className="cg-data-wrap"><table className="cg-data"><thead><tr><th>Waktu</th><th>Jenis</th><th>Keterangan</th><th className="text-right">Jumlah</th></tr></thead>
            <tbody>{d.cash.map((c) => <tr key={c.id}><td>{fmtTime(c.occurredAt)}</td><td>{c.kind === 'in' ? 'Uang masuk' : 'Uang keluar'}</td><td>{c.reason}</td><td className="text-right cg-num">{formatRp(c.amount)}</td></tr>)}</tbody></table></div>
        )}
      </div>
    );
  }

  return <Empty title="Laporan lebih lengkap ada di dashboard" hint="Buka dashboard CG POS di peramban untuk laporan lanjutan seperti laba rugi, persediaan, dan perbandingan outlet." />;
}
