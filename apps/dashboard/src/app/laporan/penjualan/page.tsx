'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { formatRp, orderTypeLabel, toCsv, type ColumnDef, type Order, type OrderItem } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { ColumnChooser, useColumnPrefs } from '@/components/column-chooser';
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
                  <div className="text-text-muted mt-2">
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
  const { ctx, value, setValue, range, today, state } = useReport();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const flip = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const colPrefs = useColumnPrefs('laporan_penjualan', SALE_COLUMNS);

  function download() {
    if (state.status !== 'ready' || !state.data || !colPrefs.hasVisible) return;
    const { orders, names } = state.data;
    const head = colPrefs.activeColumns.map((c) => c.label);
    const rows: (string | number)[][] = [head];

    for (const o of orders) {
      rows.push(colPrefs.activeColumns.map((c) => getSaleCsvVal(c.key, o, names)));
    }

    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `penjualan-${range.label.replace(/ sampai /g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Detail penjualan"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : undefined}
        actions={
          <div className="flex items-center gap-8">
            <ColumnChooser
              columns={SALE_COLUMNS}
              prefs={colPrefs.prefs}
              onToggle={colPrefs.toggle}
              onMoveUp={colPrefs.moveUp}
              onMoveDown={colPrefs.moveDown}
              onReset={colPrefs.reset}
            />
            <button
              className="cg-btn cg-btn--secondary"
              onClick={download}
              disabled={!colPrefs.hasVisible || state.status !== 'ready' || !state.data?.orders.length}
            >
              <Download className="cg-icon" aria-hidden /> Unduh CSV
            </button>
          </div>
        }
      />
      <RangePicker value={value} today={today} onChange={setValue} />
      <label className="cg-search mb-16 block">
        <span className="cg-sr">Cari nomor pesanan atau produk</span>
        <input
          className="cg-input"
          type="search"
          placeholder="Cari nomor pesanan atau produk"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {(ctx.status === 'loading' || state.status === 'loading') && (
        <div className="grid gap-8" aria-busy="true" aria-label="Memuat">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="cg-skeleton" style={{ height: 48 }} />
          ))}
        </div>
      )}
      {state.status === 'ready' &&
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
    </>
  );
}
