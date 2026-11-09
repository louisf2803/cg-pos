import { formatRp, type ReportRow, type SalesReport } from '@cgpos/shared';

/** Panel laporan yang sama dipakai di Beranda (hari ini) dan Laporan penjualan (rentang bebas). */
export function ReportView({ report: r, showHours = false }: { report: SalesReport; showHours?: boolean }) {
  const s = r.summary;
  const c = r.control;
  const maxDay = Math.max(1, ...r.byDay.map((d) => d.amount));
  const active = s.byHour.filter((h) => h.total > 0).map((h) => h.hour);
  const lo = Math.min(...active), hi = Math.max(...active);
  const hours = s.byHour.filter((h) => h.hour >= lo - 1 && h.hour <= hi + 1);
  const maxHour = Math.max(1, ...hours.map((h) => h.total));
  return (
    <div className="grid gap-24">
      <dl className="grid gap-16 tablet:grid-cols-2 desktop:grid-cols-4">
        <Kpi label="Penjualan" value={formatRp(s.total)} />
        <Kpi label="Refund" value={c.refundCount ? `-${formatRp(c.refundTotal)}` : formatRp(0)} />
        <Kpi label="Penjualan bersih" value={formatRp(c.net)} />
        <Kpi label="Transaksi" value={String(s.orderCount)} />
        <Kpi label="Rata-rata per transaksi" value={formatRp(s.avgTicket)} />
        <Kpi label="Diskon" value={formatRp(s.discounts)} />
        <Kpi label="Penjualan kotor" value={formatRp(s.gross)} />
        <Kpi label="Biaya layanan" value={formatRp(s.serviceCharge)} />
        <Kpi label="Pajak" value={formatRp(s.tax)} />
      </dl>
      {r.byDay.length > 1 && (
        <Panel id="h-hari" title="Penjualan per hari">
          <ul className="grid gap-8">
            {r.byDay.map((d) => (
              <li key={d.key} className="grid grid-cols-[88px_1fr_104px] items-center gap-8">
                <span className="text-text-muted cg-num">{d.key.slice(5)}</span>
                <span className="block h-[12px] rounded-pill bg-accent-soft" aria-hidden><span className="block h-full rounded-pill bg-accent" style={{ width: `${Math.round((d.amount / maxDay) * 100)}%` }} /></span>
                <span className="cg-num text-right">{formatRp(d.amount)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="grid gap-24 desktop:grid-cols-2">
        {showHours && (
          <Panel id="h-jam" title="Penjualan per jam">
            <ul className="grid gap-8">
              {hours.map((h) => (
                <li key={h.hour} className="grid grid-cols-[48px_1fr_104px] items-center gap-8">
                  <span className="text-text-muted cg-num">{String(h.hour).padStart(2, '0')}:00</span>
                  <span className="block h-[12px] rounded-pill bg-accent-soft" aria-hidden><span className="block h-full rounded-pill bg-accent" style={{ width: `${Math.round((h.total / maxHour) * 100)}%` }} /></span>
                  <span className="cg-num text-right">{formatRp(h.total)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <Panel id="h-metode" title="Per metode bayar">
          <Rows rows={s.byMethod.map((m) => ({ key: m.methodName, label: m.methodName, count: m.count, amount: m.amount }))} unit="x" />
        </Panel>
        <Panel id="h-jenis" title="Per jenis pesanan"><Rows rows={r.byType} unit="x" /></Panel>
        <Panel id="h-kategori" title="Per kategori produk"><Rows rows={r.byCategory} unit=" item" /></Panel>
        <Panel id="h-kasir" title="Per kasir"><Rows rows={r.byCashier} unit="x" /></Panel>
        <Panel id="h-kontrol" title="Kontrol: refund dan pembatalan">
          {c.refundCount === 0 && c.voidCount === 0 ? <p className="text-text-muted">Tidak ada refund atau pesanan dibatalkan pada rentang ini.</p> : (
            <div className="grid gap-12">
              <p className="flex justify-between gap-12"><span>Refund · {c.refundCount}x</span><span className="cg-num">{formatRp(c.refundTotal)}</span></p>
              {c.byReason.length > 0 && <Rows rows={c.byReason} unit="x" />}
              <p className="flex justify-between gap-12"><span>Pesanan dibatalkan · {c.voidCount}x</span><span className="cg-num">{formatRp(c.voidTotal)}</span></p>
            </div>
          )}
        </Panel>
        <Panel id="h-top" title="Produk terlaris">
          <div className="cg-data-wrap">
            <table className="cg-data" style={{ minWidth: 0 }}>
              <thead><tr><th>Produk</th><th className="cg-num">Terjual</th><th className="cg-num">Nilai</th></tr></thead>
              <tbody>{s.topProducts.map((p) => <tr key={p.productId}><td className="break-words">{p.name}</td><td className="cg-num">{p.qty}</td><td className="cg-num">{formatRp(p.amount)}</td></tr>)}</tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border border-border rounded-lg bg-surface-raised p-16 min-w-0">
      <h2 id={id} className="text-lg mb-12">{title}</h2>
      {children}
    </section>
  );
}
function Rows({ rows, unit }: { rows: ReportRow[]; unit: string }) {
  return (
    <ul className="grid gap-8">
      {rows.map((m) => (
        <li key={m.key} className="flex justify-between gap-12">
          <span className="break-words min-w-0">{m.label} <span className="text-text-muted">· {m.count}{unit}</span></span>
          <span className="cg-num whitespace-nowrap">{formatRp(m.amount)}</span>
        </li>
      ))}
    </ul>
  );
}
function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="border border-border rounded-lg bg-surface-raised p-16"><dt className="text-text-muted text-sm">{label}</dt><dd className="text-xl cg-num mt-4">{value}</dd></div>;
}
