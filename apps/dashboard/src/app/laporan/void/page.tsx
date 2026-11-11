'use client';

import { useMemo, useState } from 'react';
import { Download, Eye, Search, X } from 'lucide-react';
import { formatRp, toCsv, type Order } from '@cgpos/shared';
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

function VoidDetailDialog({
  order,
  tz,
  cashierName,
  approverName,
  onClose,
}: {
  order: Order;
  tz: string;
  cashierName: string;
  approverName: string;
  onClose: () => void;
}) {
  const d = useDialog(onClose);
  const reason =
    (order as unknown as { voidReason?: string; reason?: string }).voidReason ??
    (order as unknown as { voidReason?: string; reason?: string }).reason ??
    order.label ??
    'Dibatalkan oleh kasir';

  return (
    <dialog
      {...d.props}
      aria-labelledby="void-modal-title"
      onClick={(e) => {
        if (e.target === d.ref.current) onClose();
      }}
    >
      <div className="grid gap-16 min-w-0">
        <div className="flex items-start justify-between gap-12">
          <div>
            <h2 id="void-modal-title" className="cg-modal__title">
              Rincian Void: {order.number}
            </h2>
            <p className="text-sm text-text-muted m-0 mt-2">
              Waktu pembatalan: {fmtTime(order.closedAt ?? order.openedAt, tz)}
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
            <span className="text-text-muted">Kasir yang bertugas:</span>
            <span className="font-medium">{cashierName}</span>
          </div>
          <div className="flex justify-between gap-12">
            <span className="text-text-muted">Disetujui oleh:</span>
            <span className="font-medium">{approverName}</span>
          </div>
          <div className="flex justify-between gap-12">
            <span className="text-text-muted">Alasan void:</span>
            <span className="font-medium text-danger">{reason}</span>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-8">Daftar item pesanan:</h3>
          <div className="cg-data-wrap min-w-0 border border-border rounded-lg">
            <table className="cg-data w-full" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="cg-num whitespace-nowrap">Harga</th>
                  <th className="cg-num whitespace-nowrap">Qty</th>
                  <th className="cg-num whitespace-nowrap">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.id}>
                    <td className="break-words">
                      <div className="font-medium">{it.name}</div>
                      {it.note && <div className="text-xs text-text-muted">Catatan: {it.note}</div>}
                    </td>
                    <td className="cg-num whitespace-nowrap">{formatRp(it.unitPrice)}</td>
                    <td className="cg-num whitespace-nowrap">{it.qty}</td>
                    <td className="cg-num whitespace-nowrap">{formatRp(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold bg-surface">
                  <td colSpan={3}>Total nilai void</td>
                  <td className="cg-num whitespace-nowrap">{formatRp(order.total)}</td>
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

export default function LaporanVoid() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);

  const [q, setQ] = useState('');
  const [cashierFilter, setCashierFilter] = useState('');
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  const state = useAsync(async (): Promise<{ orders: Order[]; employees: Map<string, string> } | null> => {
    if (ctx.status !== 'ready') return null;
    const [orders, employees] = await Promise.all([
      data.listOrders({ status: 'void', from: range.from, to: range.to, all: true, by: 'closed' }),
      data.listManagedEmployees(),
    ]);
    const empMap = new Map(employees.map((e) => [e.id, e.name]));
    return { orders, employees: empMap };
  }, [data, ctx.status, range.from, range.to]);

  const dataPayload = state.status === 'ready' ? state.data : null;

  const filteredOrders = useMemo(() => {
    if (!dataPayload) return [];
    const needle = q.trim().toLowerCase();
    return dataPayload.orders.filter((o) => {
      if (cashierFilter && o.cashierId !== cashierFilter) return false;
      if (!needle) return true;
      const reason =
        (o as unknown as { voidReason?: string; reason?: string }).voidReason ??
        (o as unknown as { voidReason?: string; reason?: string }).reason ??
        o.label ??
        '';
      return (
        o.number.toLowerCase().includes(needle) ||
        reason.toLowerCase().includes(needle) ||
        o.items.some((it) => it.name.toLowerCase().includes(needle))
      );
    });
  }, [dataPayload, q, cashierFilter]);

  const summary = useMemo(() => {
    const totalAmount = filteredOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);
    return {
      count: filteredOrders.length,
      amount: totalAmount,
    };
  }, [filteredOrders]);

  function downloadCsv() {
    if (!dataPayload || filteredOrders.length === 0) return;
    const { employees } = dataPayload;
    const rows: (string | number)[][] = [
      ['Nomor Pesanan', 'Waktu Pembatalan', 'Kasir', 'Alasan', 'Disetujui Oleh', 'Total Nilai'],
    ];

    for (const o of filteredOrders) {
      const cashier = employees.get(o.cashierId) ?? o.cashierId;
      const reason =
        (o as unknown as { voidReason?: string; reason?: string }).voidReason ??
        (o as unknown as { voidReason?: string; reason?: string }).reason ??
        o.label ??
        'Dibatalkan oleh kasir';
      const approverId = (o as unknown as { authorizedBy?: string }).authorizedBy;
      const approver = (approverId && employees.get(approverId)) ?? approverId ?? cashier;

      rows.push([
        o.number,
        fmtTime(o.closedAt ?? o.openedAt, tz),
        cashier,
        reason,
        approver,
        o.total,
      ]);
    }

    rows.push(['Total', '', '', '', '', summary.amount]);

    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-void-${range.label.replace(/ sampai /g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const sub = ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : undefined;

  return (
    <>
      <PageHeader
        title="Laporan void"
        subtitle={sub}
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={state.status !== 'ready' || filteredOrders.length === 0}
          >
            <Download className="cg-icon" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      <div className="flex flex-wrap items-center gap-12 mb-16">
        <label className="cg-search flex-1 min-w-[220px]">
          <Search className="cg-icon cg-icon--sm" aria-hidden />
          <span className="cg-sr">Cari nomor pesanan, alasan, atau produk</span>
          <input
            className="cg-input"
            type="search"
            placeholder="Cari nomor pesanan, alasan, atau produk"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        {dataPayload && (
          <label className="flex items-center gap-8">
            <span className="cg-sr">Saring kasir</span>
            <select
              className="cg-input"
              value={cashierFilter}
              onChange={(e) => setCashierFilter(e.target.value)}
            >
              <option value="">Semua kasir</option>
              {[...dataPayload.employees.entries()].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}

      {(ctx.status === 'loading' || state.status === 'loading') && (
        <div className="grid gap-16 tablet:grid-cols-2" aria-busy="true" aria-label="Memuat laporan void">
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
              <dt className="text-text-muted text-sm font-medium">Jumlah transaksi void</dt>
              <dd className="text-xl cg-num mt-4 font-semibold">{summary.count}</dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-text-muted text-sm font-medium">Total nilai transaksi void</dt>
              <dd className="text-xl cg-num mt-4 font-semibold text-danger">{formatRp(summary.amount)}</dd>
            </div>
          </dl>

          {filteredOrders.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>
                  {q || cashierFilter
                    ? `Tidak ada pesanan void yang cocok dengan saringan.`
                    : 'Belum ada pesanan void pada rentang ini.'}
                </strong>
              </p>
              <p className="text-text-muted">Coba pilih rentang tanggal atau bersihkan pencarian.</p>
            </div>
          ) : (
            <div className="grid gap-12 min-w-0">
              <h2 className="text-base font-semibold m-0">Daftar transaksi void ({filteredOrders.length})</h2>
              <div className="cg-data-wrap min-w-0 border border-border rounded-xl">
                <table className="cg-data">
                  <thead>
                    <tr>
                      <th>Nomor</th>
                      <th>Waktu</th>
                      <th>Kasir</th>
                      <th>Alasan Void</th>
                      <th>Disetujui Oleh</th>
                      <th className="cg-num">Total</th>
                      <th><span className="cg-sr">Aksi</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((o) => {
                      const cashier = dataPayload.employees.get(o.cashierId) ?? o.cashierId;
                      const reason =
                        (o as unknown as { voidReason?: string; reason?: string }).voidReason ??
                        (o as unknown as { voidReason?: string; reason?: string }).reason ??
                        o.label ??
                        'Dibatalkan kasir';
                      const approverId = (o as unknown as { authorizedBy?: string }).authorizedBy;
                      const approver = (approverId && dataPayload.employees.get(approverId)) ?? approverId ?? cashier;

                      return (
                        <tr key={o.id}>
                          <td className="whitespace-nowrap font-medium">{o.number}</td>
                          <td className="whitespace-nowrap">{fmtTime(o.closedAt ?? o.openedAt, tz)}</td>
                          <td className="whitespace-nowrap">{cashier}</td>
                          <td className="max-w-[260px] truncate" title={reason}>
                            {reason}
                          </td>
                          <td className="whitespace-nowrap">{approver}</td>
                          <td className="cg-num font-semibold text-danger">{formatRp(o.total)}</td>
                          <td className="whitespace-nowrap text-right">
                            <button
                              type="button"
                              className="cg-btn cg-btn--ghost cg-btn--sm"
                              onClick={() => setDetailOrder(o)}
                              aria-label={`Lihat rincian ${o.number}`}
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

      {detailOrder && dataPayload && (
        <VoidDetailDialog
          order={detailOrder}
          tz={tz}
          cashierName={dataPayload.employees.get(detailOrder.cashierId) ?? detailOrder.cashierId}
          approverName={
            ((detailOrder as unknown as { authorizedBy?: string }).authorizedBy &&
              dataPayload.employees.get((detailOrder as unknown as { authorizedBy?: string }).authorizedBy!)) ??
            (detailOrder as unknown as { authorizedBy?: string }).authorizedBy ??
            dataPayload.employees.get(detailOrder.cashierId) ??
            '—'
          }
          onClose={() => setDetailOrder(null)}
        />
      )}
    </>
  );
}
