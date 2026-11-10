'use client';

import { useMemo, useState } from 'react';
import { Download, Eye, Search, X } from 'lucide-react';
import { formatRp, toCsv, type Order, type Refund } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useDialog } from '@/components/fin-common';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

const fmtTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));

function RefundDetailDialog({
  refund,
  orderNumber,
  orderItems,
  tz,
  onClose,
}: {
  refund: Refund;
  orderNumber: string;
  orderItems: Map<string, string>;
  tz: string;
  onClose: () => void;
}) {
  const d = useDialog(onClose);
  const restock = (refund as unknown as { restock?: boolean }).restock;

  return (
    <dialog
      {...d.props}
      aria-labelledby="refund-modal-title"
      onClick={(e) => {
        if (e.target === d.ref.current) onClose();
      }}
    >
      <div className="grid gap-16 min-w-0">
        <div className="flex items-start justify-between gap-12">
          <div>
            <h2 id="refund-modal-title" className="cg-modal__title">
              Rincian Refund: {refund.number}
            </h2>
            <p className="text-sm text-text-muted m-0 mt-2">
              Waktu refund: {fmtTime(refund.createdAt, tz)}
            </p>
          </div>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={onClose}
            aria-label="Tutup dialog"
          >
            <X className="cg-icon cg-icon--sm" aria-hidden />
          </button>
        </div>

        <div className="grid gap-8 p-12 border border-border rounded-lg bg-surface text-sm">
          <div className="flex justify-between gap-12">
            <span className="text-text-muted">Nomor pesanan:</span>
            <span className="font-medium">{orderNumber}</span>
          </div>
          <div className="flex justify-between gap-12">
            <span className="text-text-muted">Metode pengembalian:</span>
            <span className="font-medium">{refund.methodName || 'Kas Tunai'}</span>
          </div>
          <div className="flex justify-between gap-12">
            <span className="text-text-muted">Dikembalikan ke stok:</span>
            <span className="font-medium">
              {restock === false ? (
                <span className="cg-badge">Tidak</span>
              ) : (
                <span className="cg-badge cg-badge--success">Ya</span>
              )}
            </span>
          </div>
          <div className="flex justify-between gap-12">
            <span className="text-text-muted">Alasan refund:</span>
            <span className="font-medium text-danger">{refund.reason}</span>
          </div>
          {refund.note && (
            <div className="flex justify-between gap-12">
              <span className="text-text-muted">Catatan tambahan:</span>
              <span>{refund.note}</span>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-8">Barang yang dikembalikan:</h3>
          <div className="cg-data-wrap border border-border rounded-lg">
            <table className="cg-data">
              <thead>
                <tr>
                  <th>Barang</th>
                  <th className="cg-num">Qty</th>
                  <th className="cg-num">Jumlah Refund</th>
                </tr>
              </thead>
              <tbody>
                {refund.items.map((it, idx) => (
                  <tr key={it.orderItemId || idx}>
                    <td className="break-words font-medium">
                      {orderItems.get(it.orderItemId) ?? `Item (${it.orderItemId.slice(0, 8)})`}
                    </td>
                    <td className="cg-num">{it.qty}</td>
                    <td className="cg-num">{formatRp(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold bg-surface">
                  <td colSpan={2}>Total pengembalian dana</td>
                  <td className="cg-num text-danger">{formatRp(refund.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-8 mt-8">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function LaporanRefund() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);

  const [q, setQ] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [detailRefund, setDetailRefund] = useState<Refund | null>(null);

  const state = useAsync(async (): Promise<{
    refunds: Refund[];
    orders: Map<string, Order>;
    itemNames: Map<string, string>;
    methods: string[];
  } | null> => {
    if (ctx.status !== 'ready') return null;
    const [refunds, orders] = await Promise.all([
      data.listRefundsBetween(range),
      data.listOrders({ from: range.from, to: range.to, all: true }),
    ]);

    const orderMap = new Map<string, Order>();
    const itemNames = new Map<string, string>();
    for (const o of orders) {
      orderMap.set(o.id, o);
      for (const it of o.items) {
        itemNames.set(it.id, it.name);
      }
    }

    const methods = Array.from(new Set(refunds.map((r) => r.methodName).filter(Boolean)));

    return { refunds, orders: orderMap, itemNames, methods };
  }, [data, ctx.status, range.from, range.to]);

  const dataPayload = state.status === 'ready' ? state.data : null;

  const filteredRefunds = useMemo(() => {
    if (!dataPayload) return [];
    const needle = q.trim().toLowerCase();
    return dataPayload.refunds.filter((r) => {
      if (methodFilter && r.methodName !== methodFilter) return false;
      if (!needle) return true;
      const orderNum = dataPayload.orders.get(r.orderId)?.number ?? '';
      return (
        r.number.toLowerCase().includes(needle) ||
        orderNum.toLowerCase().includes(needle) ||
        r.reason.toLowerCase().includes(needle) ||
        (r.note ?? '').toLowerCase().includes(needle) ||
        r.items.some((it) => {
          const name = dataPayload.itemNames.get(it.orderItemId) ?? '';
          return name.toLowerCase().includes(needle);
        })
      );
    });
  }, [dataPayload, q, methodFilter]);

  const summary = useMemo(() => {
    const totalAmount = filteredRefunds.reduce((sum, r) => sum + (r.total ?? 0), 0);
    return {
      count: filteredRefunds.length,
      amount: totalAmount,
    };
  }, [filteredRefunds]);

  function downloadCsv() {
    if (!dataPayload || filteredRefunds.length === 0) return;
    const rows: (string | number)[][] = [
      ['Nomor Refund', 'Nomor Pesanan', 'Waktu', 'Alasan', 'Metode', 'Dikembalikan ke Stok', 'Nilai Refund'],
    ];

    for (const r of filteredRefunds) {
      const orderNum = dataPayload.orders.get(r.orderId)?.number ?? r.number.replace(/^R\d+-/, '');
      const restock = (r as unknown as { restock?: boolean }).restock === false ? 'Tidak' : 'Ya';
      rows.push([
        r.number,
        orderNum,
        fmtTime(r.createdAt, tz),
        r.reason,
        r.methodName || 'Kas Tunai',
        restock,
        r.total,
      ]);
    }

    rows.push(['Total', '', '', '', '', '', summary.amount]);

    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-refund-${range.label.replace(/ sampai /g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const sub = ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : undefined;

  return (
    <>
      <PageHeader
        title="Laporan refund"
        subtitle={sub}
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={state.status !== 'ready' || filteredRefunds.length === 0}
          >
            <Download className="cg-icon" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      <div className="flex flex-wrap items-center gap-12 mb-16">
        <label className="cg-search flex-1 min-w-[220px]">
          <Search className="cg-icon cg-icon--sm" aria-hidden />
          <span className="cg-sr">Cari nomor refund, pesanan, alasan, atau barang</span>
          <input
            className="cg-input"
            type="search"
            placeholder="Cari nomor refund, pesanan, alasan, atau barang"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        {dataPayload && dataPayload.methods.length > 0 && (
          <label className="flex items-center gap-8">
            <span className="cg-sr">Saring metode pengembalian</span>
            <select
              className="cg-input"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              <option value="">Semua metode</option>
              {dataPayload.methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}

      {(ctx.status === 'loading' || state.status === 'loading') && (
        <div className="grid gap-16 tablet:grid-cols-2" aria-busy="true" aria-label="Memuat laporan refund">
          {[0, 1].map((i) => (
            <div key={i} className="cg-skeleton" style={{ height: 88 }} />
          ))}
        </div>
      )}

      {state.status === 'ready' && dataPayload && (
        <div className="grid gap-24 min-w-0">
          {/* Kartu Ringkasan */}
          <dl className="grid gap-16 tablet:grid-cols-2 m-0">
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-text-muted text-sm font-medium">Jumlah transaksi refund</dt>
              <dd className="text-xl cg-num mt-4 font-semibold">{summary.count}</dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-text-muted text-sm font-medium">Total dana dikembalikan</dt>
              <dd className="text-xl cg-num mt-4 font-semibold text-danger">{formatRp(summary.amount)}</dd>
            </div>
          </dl>

          {filteredRefunds.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>
                  {q || methodFilter
                    ? 'Tidak ada data refund yang cocok dengan saringan.'
                    : 'Belum ada transaksi refund pada rentang ini.'}
                </strong>
              </p>
              <p className="text-text-muted">Coba pilih rentang tanggal atau bersihkan pencarian.</p>
            </div>
          ) : (
            <div className="grid gap-12 min-w-0">
              <h2 className="text-base font-semibold m-0">Daftar transaksi refund ({filteredRefunds.length})</h2>
              <div className="cg-data-wrap min-w-0 border border-border rounded-xl">
                <table className="cg-data">
                  <thead>
                    <tr>
                      <th>Nomor Refund</th>
                      <th>Pesanan</th>
                      <th>Waktu</th>
                      <th>Alasan</th>
                      <th>Metode</th>
                      <th>Restock</th>
                      <th className="cg-num">Nilai Refund</th>
                      <th><span className="cg-sr">Aksi</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRefunds.map((r) => {
                      const orderNum =
                        dataPayload.orders.get(r.orderId)?.number ?? r.number.replace(/^R\d+-/, '');
                      const restock = (r as unknown as { restock?: boolean }).restock !== false;

                      return (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap font-medium">{r.number}</td>
                          <td className="whitespace-nowrap text-text-muted">{orderNum}</td>
                          <td className="whitespace-nowrap">{fmtTime(r.createdAt, tz)}</td>
                          <td className="max-w-[240px] truncate" title={r.reason}>
                            {r.reason}
                          </td>
                          <td className="whitespace-nowrap">{r.methodName || 'Kas Tunai'}</td>
                          <td className="whitespace-nowrap">
                            {restock ? (
                              <span className="cg-badge cg-badge--success">Ya</span>
                            ) : (
                              <span className="cg-badge">Tidak</span>
                            )}
                          </td>
                          <td className="cg-num font-semibold text-danger">{formatRp(r.total)}</td>
                          <td className="whitespace-nowrap text-right">
                            <button
                              type="button"
                              className="cg-btn cg-btn--ghost cg-btn--sm"
                              onClick={() => setDetailRefund(r)}
                              aria-label={`Lihat rincian ${r.number}`}
                            >
                              <Eye className="cg-icon cg-icon--sm" aria-hidden /> Rincian
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {detailRefund && dataPayload && (
        <RefundDetailDialog
          refund={detailRefund}
          orderNumber={dataPayload.orders.get(detailRefund.orderId)?.number ?? detailRefund.number.replace(/^R\d+-/, '')}
          orderItems={dataPayload.itemNames}
          tz={tz}
          onClose={() => setDetailRefund(null)}
        />
      )}
    </>
  );
}
