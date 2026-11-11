'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { formatRp, orderTypeLabel, toCsv, type ColumnDef, type Order, type OrderItem } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { ColumnChooser, useColumnPrefs } from '@/components/column-chooser';
import { downloadCsvWithHistory } from '@/lib/export';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { useReport } from '@/lib/use-report';

const fmtTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));

type SaleColKey =
  | 'number'
  | 'time'
  | 'type'
  | 'cashier'
  | 'payment'
  | 'subtotal'
  | 'discount'
  | 'service'
  | 'tax'
  | 'rounding'
  | 'total';

const SALE_COLUMNS: ColumnDef<SaleColKey>[] = [
  { key: 'number', label: 'Nomor pesanan', align: 'left' },
  { key: 'time', label: 'Waktu', align: 'left' },
  { key: 'type', label: 'Jenis pesanan', align: 'left' },
  { key: 'cashier', label: 'Kasir', align: 'left' },
  { key: 'payment', label: 'Metode bayar', align: 'left' },
  { key: 'subtotal', label: 'Subtotal', defaultVisible: false, align: 'right' },
  { key: 'discount', label: 'Diskon', defaultVisible: false, align: 'right' },
  { key: 'service', label: 'Biaya layanan', defaultVisible: false, align: 'right' },
  { key: 'tax', label: 'Pajak', defaultVisible: false, align: 'right' },
  { key: 'rounding', label: 'Pembulatan', defaultVisible: false, align: 'right' },
  { key: 'total', label: 'Total', align: 'right' },
];

function OrderRefundHistory({
  orderId,
  items,
  tz,
  colSpan,
}: {
  orderId: string;
  items: OrderItem[];
  tz: string;
  colSpan: number;
}) {
  const data = useData();
  const state = useAsync(() => data.listRefunds(orderId), [data, orderId]);

  if (state.status !== 'ready' || state.data.length === 0) return null;

  const itemMap = new Map(items.map((i) => [i.id, i.name]));

  return (
    <tr>
      <td colSpan={colSpan} style={{ paddingLeft: 48, background: 'var(--color-surface)' }}>
        <div className="py-8">
          <div className="text-xs font-semibold text-danger mb-4">
            Riwayat refund ({state.data.length}x pengembalian):
          </div>
          <div className="grid gap-6">
            {state.data.map((r) => (
              <div
                key={r.id}
                className="text-xs flex flex-wrap justify-between gap-12 border-t border-border pt-4"
              >
                <div>
                  <span className="font-medium text-text">{r.number}</span>
                  <span className="text-text-muted"> · {fmtTime(r.createdAt, tz)}</span>
                  <span className="text-danger"> · Alasan: {r.reason}</span>
                  <div className="text-text-muted mt-[2px]">
                    Barang:{' '}
                    {r.items.map((it) => `${it.qty}× ${itemMap.get(it.orderItemId) ?? 'Item'}`).join(', ')}
                  </div>
                </div>
                <div className="cg-num font-semibold text-danger">
                  -{formatRp(r.total)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </td>
    </tr>
  );
}

function getSaleCsvVal(key: SaleColKey, o: Order, names: Map<string, string>): string | number {
  switch (key) {
    case 'number':
      return o.number;
    case 'time':
      return o.closedAt ?? o.openedAt;
    case 'type':
      return orderTypeLabel(o.type);
    case 'cashier':
      return names.get(o.cashierId) ?? '';
    case 'payment':
      return o.payments.map((p) => p.methodName).join(' + ');
    case 'subtotal':
      return o.subtotal;
    case 'discount':
      return o.discountTotal;
    case 'service':
      return o.serviceCharge;
    case 'tax':
      return o.taxTotal;
    case 'rounding':
      return o.rounding;
    case 'total':
      return o.total;
  }
}

function renderSaleCell(
  key: SaleColKey,
  o: Order,
  tz: string,
  names: Map<string, string>,
  ex: boolean,
  onFlip: () => void
) {
  switch (key) {
    case 'number':
      return (
        <td key={key} className="whitespace-nowrap">
          <button
            className="cg-btn cg-btn--ghost cg-btn--sm"
            aria-expanded={ex}
            aria-label={`${ex ? 'Tutup' : 'Buka'} rincian ${o.number}`}
            onClick={onFlip}
          >
            {ex ? (
              <ChevronDown className="cg-icon cg-icon--sm" aria-hidden />
            ) : (
              <ChevronRight className="cg-icon cg-icon--sm" aria-hidden />
            )}
          </button>
          {o.number}
        </td>
      );
    case 'time':
      return (
        <td key={key} className="whitespace-nowrap">
          {fmtTime(o.closedAt ?? o.openedAt, tz)}
        </td>
      );
    case 'type':
      return (
        <td key={key} className="whitespace-nowrap">
          {orderTypeLabel(o.type)}
        </td>
      );
    case 'cashier':
      return <td key={key} className="break-words">{names.get(o.cashierId) ?? '—'}</td>;
    case 'payment':
      return (
        <td key={key} className="break-words">
          {o.payments.map((p) => p.methodName).join(' + ') || '—'}
        </td>
      );
    case 'subtotal':
      return <td key={key} className="cg-num whitespace-nowrap">{formatRp(o.subtotal)}</td>;
    case 'discount':
      return (
        <td key={key} className="cg-num whitespace-nowrap text-danger">
          {o.discountTotal > 0 ? `-${formatRp(o.discountTotal)}` : 'Rp 0'}
        </td>
      );
    case 'service':
      return <td key={key} className="cg-num whitespace-nowrap">{formatRp(o.serviceCharge)}</td>;
    case 'tax':
      return <td key={key} className="cg-num whitespace-nowrap">{formatRp(o.taxTotal)}</td>;
    case 'rounding':
      return <td key={key} className="cg-num whitespace-nowrap">{formatRp(o.rounding)}</td>;
    case 'total':
      return <td key={key} className="cg-num whitespace-nowrap font-medium">{formatRp(o.total)}</td>;
  }
}

export default function DetailPenjualan() {
  const data = useData();
  const { ctx, value, setValue, range, today, state } = useReport();
  const [tab, setTab] = useState<'paid' | 'unpaid'>('paid');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const unpaidState = useAsync(async (): Promise<Order[] | null> => {
    if (ctx.status !== 'ready') return null;
    const [openOrders, partOrders] = await Promise.all([
      data.listOrders({ status: 'open', from: range.from, to: range.to, by: 'opened', all: true }),
      data.listOrders({ status: 'partially_paid', from: range.from, to: range.to, by: 'opened', all: true }),
    ]);
    return [...openOrders, ...partOrders].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }, [data, ctx.status, range.from, range.to]);

  const flip = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const colPrefs = useColumnPrefs('laporan_penjualan', SALE_COLUMNS);

  const unpaidOrders = unpaidState.status === 'ready' && unpaidState.data ? unpaidState.data : [];
  const totalUnpaidDue = unpaidOrders.reduce((s, o) => s + Math.max(0, o.total - o.paidTotal), 0);
  const grossSales = state.status === 'ready' && state.data ? state.data.report.summary.total : 0;
  const refundTotal = state.status === 'ready' && state.data ? state.data.report.control.refundTotal : 0;
  const refundCount = state.status === 'ready' && state.data ? state.data.report.control.refundCount : 0;
  const netSales = state.status === 'ready' && state.data ? state.data.report.control.net : 0;

  function download() {
    if (state.status !== 'ready' || !state.data) return;
    const { orders, names } = state.data;
    if (tab === 'unpaid') {
      if (unpaidOrders.length === 0) return;
      const rows: (string | number)[][] = [
        ['Nomor pesanan', 'Waktu buka', 'Jenis pesanan', 'Kasir', 'Status', 'Total tagihan', 'Sudah dibayar', 'Sisa piutang'],
        ...unpaidOrders.map((o) => [
          o.number,
          o.openedAt,
          orderTypeLabel(o.type),
          names.get(o.cashierId) ?? '',
          o.status === 'partially_paid' ? 'Bayar sebagian' : 'Belum dibayar',
          o.total,
          o.paidTotal,
          Math.max(0, o.total - o.paidTotal),
        ]),
      ];
      downloadCsvWithHistory({
        fileName: `piutang-penjualan-${range.label.replace(/ sampai /g, '_')}.csv`,
        csvContent: toCsv(rows),
        reportName: 'Detail Penjualan — Piutang (Belum Dibayar)',
        period: range.label,
        rowCount: unpaidOrders.length,
        sourceUrl: `/laporan/penjualan?from=${range.from}&to=${range.to}`,
        params: { from: range.from, to: range.to, status: 'unpaid' },
      });
      return;
    }

    if (!colPrefs.hasVisible || orders.length === 0) return;
    const head = colPrefs.activeColumns.map((c) => c.label);
    const rows: (string | number)[][] = [head];

    for (const o of orders) {
      rows.push(colPrefs.activeColumns.map((c) => getSaleCsvVal(c.key, o, names)));
    }

    const fileName = `penjualan-${range.label.replace(/ sampai /g, '_')}.csv`;
    downloadCsvWithHistory({
      fileName,
      csvContent: toCsv(rows),
      reportName: 'Detail Penjualan',
      period: range.label,
      rowCount: orders.length,
      sourceUrl: `/laporan/penjualan?from=${range.from}&to=${range.to}`,
      params: { from: range.from, to: range.to },
    });
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Detail penjualan"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-8">
            {tab === 'paid' && (
              <ColumnChooser
                columns={SALE_COLUMNS}
                prefs={colPrefs.prefs}
                onToggle={colPrefs.toggle}
                onMoveUp={colPrefs.moveUp}
                onMoveDown={colPrefs.moveDown}
                onReset={colPrefs.reset}
              />
            )}
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              onClick={download}
              disabled={
                tab === 'paid'
                  ? !colPrefs.hasVisible || state.status !== 'ready' || !state.data?.orders.length
                  : state.status !== 'ready' || unpaidOrders.length === 0
              }
            >
              <Download className="cg-icon" aria-hidden /> Unduh CSV
            </button>
          </div>
        }
      />
      <RangePicker value={value} today={today} onChange={setValue} />

      {state.status === 'ready' && state.data && (
        <div className="grid grid-cols-2 laptop:grid-cols-4 gap-12 mb-16" aria-label="Ringkasan penjualan dan piutang">
          <div className="cg-card p-12 min-w-0">
            <span className="block text-xs text-text-muted">Penjualan lunas</span>
            <strong className="cg-num text-lg block mt-4">{formatRp(grossSales)}</strong>
            <span className="text-xs text-text-muted cg-num">{state.data.orders.length} transaksi</span>
          </div>
          <div className="cg-card p-12 min-w-0">
            <span className="block text-xs text-text-muted">Total refund</span>
            <strong className={`cg-num text-lg block mt-4 ${refundTotal > 0 ? 'text-danger' : ''}`}>
              {refundTotal > 0 ? `-${formatRp(refundTotal)}` : formatRp(0)}
            </strong>
            <span className="text-xs text-text-muted cg-num">{refundCount} pengembalian</span>
          </div>
          <div className="cg-card p-12 min-w-0">
            <span className="block text-xs text-text-muted">Penjualan bersih</span>
            <strong className="cg-num text-lg block mt-4 text-accent-strong">{formatRp(netSales)}</strong>
            <span className="text-xs text-text-muted">Sesudah dikurangi refund</span>
          </div>
          <div className="cg-card p-12 min-w-0">
            <span className="block text-xs text-text-muted">Piutang (belum dibayar)</span>
            <strong className={`cg-num text-lg block mt-4 ${totalUnpaidDue > 0 ? 'text-warning' : ''}`}>
              {formatRp(totalUnpaidDue)}
            </strong>
            <span className="text-xs text-text-muted cg-num">{unpaidOrders.length} pesanan terbuka</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-12 mb-16">
        <div className="cg-tabs" role="tablist" aria-label="Status pembayaran pesanan">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'paid'}
            className="cg-tab whitespace-nowrap"
            onClick={() => setTab('paid')}
          >
            Lunas ({state.status === 'ready' && state.data ? state.data.orders.length : 0})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'unpaid'}
            className="cg-tab whitespace-nowrap"
            onClick={() => setTab('unpaid')}
          >
            Belum dibayar / Piutang ({unpaidOrders.length})
          </button>
        </div>
        <label className="cg-search flex-1 min-w-[200px] max-w-sm">
          <span className="cg-sr">Cari nomor pesanan atau produk</span>
          <input
            className="cg-input"
            type="search"
            placeholder="Cari nomor pesanan atau produk"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {tab === 'unpaid' && unpaidState.status === 'error' && <ErrorBox message={unpaidState.message} onRetry={unpaidState.reload} />}
      {(ctx.status === 'loading' || state.status === 'loading' || (tab === 'unpaid' && unpaidState.status === 'loading')) && (
        <div className="grid gap-8" aria-busy="true" aria-label="Memuat">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="cg-skeleton" style={{ height: 48 }} />
          ))}
        </div>
      )}
      {tab === 'unpaid' &&
        state.status === 'ready' &&
        state.data &&
        unpaidState.status === 'ready' &&
        (() => {
          const needle = q.trim().toLowerCase();
          const list = unpaidOrders.filter(
            (o) =>
              !needle ||
              o.number.toLowerCase().includes(needle) ||
              (o.customerName ?? '').toLowerCase().includes(needle) ||
              (o.label ?? '').toLowerCase().includes(needle) ||
              o.items.some((i) => i.name.toLowerCase().includes(needle))
          );
          if (list.length === 0) {
            return (
              <div className="cg-empty">
                <p>
                  <strong>{needle ? `Tidak ada piutang untuk “${q}”.` : 'Tidak ada pesanan belum dibayar pada rentang ini.'}</strong>
                </p>
              </div>
            );
          }
          return (
            <>
              <p className="text-text-muted mb-8" aria-live="polite">
                {list.length} pesanan belum dibayar · sisa piutang{' '}
                {formatRp(list.reduce((a, o) => a + Math.max(0, o.total - o.paidTotal), 0))}
              </p>
              <div className="cg-data-wrap">
                <table className="cg-data" aria-label="Daftar pesanan belum dibayar">
                  <thead>
                    <tr>
                      <th>Nomor pesanan</th>
                      <th>Waktu buka</th>
                      <th>Jenis &amp; keterangan</th>
                      <th>Kasir</th>
                      <th>Status</th>
                      <th className="cg-num">Tagihan</th>
                      <th className="cg-num">Terbayar</th>
                      <th className="cg-num">Sisa piutang</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((o) => {
                      const ex = open.has(o.id);
                      const remaining = Math.max(0, o.total - o.paidTotal);
                      return (
                        <Fragment key={o.id}>
                          <tr>
                            <td className="whitespace-nowrap">
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                aria-expanded={ex}
                                aria-label={`${ex ? 'Tutup' : 'Buka'} rincian ${o.number}`}
                                onClick={() => flip(o.id)}
                              >
                                {ex ? (
                                  <ChevronDown className="cg-icon cg-icon--sm" aria-hidden />
                                ) : (
                                  <ChevronRight className="cg-icon cg-icon--sm" aria-hidden />
                                )}
                              </button>
                              {o.number}
                            </td>
                            <td className="whitespace-nowrap">{fmtTime(o.openedAt, tz)}</td>
                            <td className="break-words">
                              {orderTypeLabel(o.type)}
                              {(o.customerName || o.label) && (
                                <span className="block text-xs text-text-muted">
                                  {[o.customerName, o.label].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </td>
                            <td className="break-words">{state.data!.names.get(o.cashierId) ?? '—'}</td>
                            <td>
                              <span className={`cg-badge ${o.status === 'partially_paid' ? 'cg-badge--info' : 'cg-badge--warning'}`}>
                                {o.status === 'partially_paid' ? 'Bayar sebagian' : 'Belum dibayar'}
                              </span>
                            </td>
                            <td className="cg-num whitespace-nowrap">{formatRp(o.total)}</td>
                            <td className="cg-num whitespace-nowrap">{formatRp(o.paidTotal)}</td>
                            <td className="cg-num whitespace-nowrap font-semibold text-warning">{formatRp(remaining)}</td>
                          </tr>
                          {ex &&
                            o.items.map((i) => (
                              <tr key={i.id} className="text-text-muted">
                                <td colSpan={7} style={{ paddingLeft: 48 }} className="break-words">
                                  {i.qty}× {i.name}
                                  {i.note ? ` — ${i.note}` : ''}
                                </td>
                                <td className="cg-num whitespace-nowrap">{formatRp(i.lineTotal)}</td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      {tab === 'paid' && state.status === 'ready' &&
        state.data &&
        (() => {
          const needle = q.trim().toLowerCase();
          const list = state.data.orders.filter(
            (o) =>
              !needle ||
              o.number.toLowerCase().includes(needle) ||
              o.items.some((i) => i.name.toLowerCase().includes(needle))
          );
          if (!colPrefs.hasVisible) {
            return (
              <div className="cg-empty py-32">
                <p>
                  <strong>Semua kolom disembunyikan.</strong>
                </p>
                <p className="text-text-muted mt-4">
                  Klik tombol <strong>Atur kolom</strong> untuk memilih kolom yang ingin ditampilkan.
                </p>
              </div>
            );
          }

          if (list.length === 0)
            return (
              <div className="cg-empty">
                <p>
                  <strong>{needle ? `Tidak ada pesanan untuk “${q}”.` : 'Tidak ada penjualan pada rentang ini.'}</strong>
                </p>
              </div>
            );

          return (
            <>
              <p className="text-text-muted mb-8" aria-live="polite">
                {list.length} transaksi · {formatRp(list.reduce((a, o) => a + o.total, 0))}
              </p>
              <div className="cg-data-wrap">
                <table className="cg-data">
                  <thead>
                    <tr>
                      {colPrefs.activeColumns.map((c) => (
                        <th key={c.key} className={c.align === 'right' ? 'cg-num' : ''}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((o) => {
                      const ex = open.has(o.id);
                      return (
                        <Fragment key={o.id}>
                          <tr>
                            {colPrefs.activeColumns.map((c) =>
                              renderSaleCell(
                                c.key,
                                o,
                                tz,
                                state.data!.names,
                                ex,
                                () => flip(o.id)
                              )
                            )}
                          </tr>
                          {ex &&
                            o.items.map((i) => (
                              <tr key={i.id} className="text-text-muted">
                                <td
                                  colSpan={Math.max(1, colPrefs.activeColumns.length - 1)}
                                  style={{ paddingLeft: 48 }}
                                  className="break-words"
                                >
                                  {i.qty}× {i.name}
                                  {i.note ? ` — ${i.note}` : ''}
                                </td>
                                <td className="cg-num">{formatRp(i.lineTotal)}</td>
                              </tr>
                            ))}
                          {ex && (
                            <OrderRefundHistory
                              orderId={o.id}
                              items={o.items}
                              tz={tz}
                              colSpan={colPrefs.activeColumns.length}
                            />
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
    </div>
  );
}
