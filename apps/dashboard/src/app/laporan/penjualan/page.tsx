'use client';
import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { formatRp, orderTypeLabel, toCsv, type OrderItem } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { useReport } from '@/lib/use-report';

const fmtTime = (iso: string, tz: string) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

function OrderRefundHistory({
  orderId,
  items,
  tz,
}: {
  orderId: string;
  items: OrderItem[];
  tz: string;
}) {
  const data = useData();
  const state = useAsync(() => data.listRefunds(orderId), [data, orderId]);

  if (state.status !== 'ready' || state.data.length === 0) return null;

  const itemMap = new Map(items.map((i) => [i.id, i.name]));

  return (
    <tr>
      <td colSpan={6} style={{ paddingLeft: 48, background: 'var(--color-surface)' }}>
        <div className="py-8">
          <div className="text-xs font-semibold text-danger mb-4">
            Riwayat refund ({state.data.length}x pengembalian):
          </div>
          <div className="grid gap-6">
            {state.data.map((r) => (
              <div key={r.id} className="text-xs flex flex-wrap justify-between gap-12 border-t border-border pt-4">
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

export default function DetailPenjualan() {
  const { ctx, value, setValue, range, today, state } = useReport();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const flip = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function download() {
    if (state.status !== 'ready' || !state.data) return;
    const { orders, names } = state.data;
    const rows: (string | number)[][] = [['Nomor', 'Waktu tutup', 'Jenis', 'Kasir', 'Subtotal', 'Diskon', 'Biaya layanan', 'Pajak', 'Pembulatan', 'Total', 'Metode bayar']];
    for (const o of orders) rows.push([o.number, o.closedAt ?? o.openedAt, orderTypeLabel(o.type), names.get(o.cashierId) ?? '', o.subtotal, o.discountTotal, o.serviceCharge, o.taxTotal, o.rounding, o.total, o.payments.map((p) => p.methodName).join(' + ')]);
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `penjualan-${range.label.replace(/ sampai /, '_')}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Detail penjualan" subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : undefined}
        actions={<button className="cg-btn cg-btn--secondary" onClick={download} disabled={state.status !== 'ready' || !state.data?.orders.length}><Download className="cg-icon" aria-hidden /> Unduh CSV</button>} />
      <RangePicker value={value} today={today} onChange={setValue} />
      <label className="cg-search mb-16 block">
        <span className="cg-sr">Cari nomor pesanan atau produk</span>
        <input className="cg-input" type="search" placeholder="Cari nomor pesanan atau produk" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {(ctx.status === 'loading' || state.status === 'loading') && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {state.status === 'ready' && state.data && (() => {
        const needle = q.trim().toLowerCase();
        const list = state.data.orders.filter((o) => !needle || o.number.toLowerCase().includes(needle) || o.items.some((i) => i.name.toLowerCase().includes(needle)));
        if (list.length === 0) return <div className="cg-empty"><p><strong>{needle ? `Tidak ada pesanan untuk “${q}”.` : 'Tidak ada penjualan pada rentang ini.'}</strong></p></div>;
        return (
          <>
            <p className="text-text-muted mb-8" aria-live="polite">{list.length} transaksi · {formatRp(list.reduce((a, o) => a + o.total, 0))}</p>
            <div className="cg-data-wrap">
              <table className="cg-data">
                <thead><tr><th>Pesanan</th><th>Waktu</th><th>Jenis</th><th>Kasir</th><th>Bayar</th><th className="cg-num">Total</th></tr></thead>
                <tbody>
                  {list.map((o) => {
                    const ex = open.has(o.id);
                    return (
                      <Fragment key={o.id}>
                        <tr>
                          <td className="whitespace-nowrap">
                            <button className="cg-btn cg-btn--ghost cg-btn--sm" aria-expanded={ex} aria-label={`${ex ? 'Tutup' : 'Buka'} rincian ${o.number}`} onClick={() => flip(o.id)}>
                              {ex ? <ChevronDown className="cg-icon cg-icon--sm" aria-hidden /> : <ChevronRight className="cg-icon cg-icon--sm" aria-hidden />}
                            </button>{o.number}
                          </td>
                          <td className="whitespace-nowrap">{fmtTime(o.closedAt ?? o.openedAt, tz)}</td>
                          <td className="whitespace-nowrap">{orderTypeLabel(o.type)}</td>
                          <td className="break-words">{state.data!.names.get(o.cashierId) ?? '—'}</td>
                          <td className="break-words">{o.payments.map((p) => p.methodName).join(' + ')}</td>
                          <td className="cg-num whitespace-nowrap">{formatRp(o.total)}</td>
                        </tr>
                        {ex && o.items.map((i) => (
                          <tr key={i.id} className="text-text-muted">
                            <td colSpan={4} style={{ paddingLeft: 48 }} className="break-words">{i.qty}× {i.name}{i.note ? ` — ${i.note}` : ''}</td>
                            <td />
                            <td className="cg-num">{formatRp(i.lineTotal)}</td>
                          </tr>
                        ))}
                        {ex && <OrderRefundHistory orderId={o.id} items={o.items} tz={tz} />}
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
