'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Download, Search } from 'lucide-react';
import {
  formatRp, STOCK_STATUS_LABEL, toCsv,
  type StockFilter, type StockItem, type StockStatus,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

const fmtQty = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);
const KIND_LABEL = { goods: 'Barang jadi', ingredient: 'Bahan baku' } as const;
const BADGE: Record<StockStatus, string> = {
  ok: 'cg-badge--success',
  low: 'cg-badge--warning',
  out: 'cg-badge--danger',
  negative: 'cg-badge--danger',
};

export default function LaporanPersediaan() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const stockAsync = useAsync(() => data.listStock(), [data]);

  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState<'' | StockItem['kind']>('');
  const [statusFilter, setStatusFilter] = useState<'' | StockFilter>('');

  const allItems = stockAsync.status === 'ready' ? stockAsync.data : [];

  const metrics = useMemo(() => {
    let totalValue = 0;
    let totalQty = 0;
    let lowCount = 0;
    let outCount = 0;
    let negativeCount = 0;
    let okCount = 0;

    for (const item of allItems) {
      totalValue += item.value;
      totalQty += item.qty;
      if (item.status === 'low') lowCount++;
      else if (item.status === 'out') outCount++;
      else if (item.status === 'negative') negativeCount++;
      else okCount++;
    }

    const alertCount = lowCount + outCount + negativeCount;

    return {
      totalValue,
      totalQty,
      totalItems: allItems.length,
      lowCount,
      outCount,
      negativeCount,
      okCount,
      alertCount,
    };
  }, [allItems]);

  const filteredItems = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allItems.filter((i) => {
      if (kindFilter && i.kind !== kindFilter) return false;
      if (statusFilter) {
        if (statusFilter === 'alert') {
          if (i.status === 'ok') return false;
        } else if (i.status !== statusFilter) {
          return false;
        }
      }
      if (needle && !i.name.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [allItems, kindFilter, statusFilter, q]);

  function downloadCsv() {
    if (filteredItems.length === 0) return;
    const rows: (string | number)[][] = [
      ['Nama Item', 'Jenis', 'Satuan', 'Sisa Stok', 'Batas Minimum', 'Biaya Rata-rata', 'Nilai Persediaan', 'Status'],
    ];

    for (const item of filteredItems) {
      rows.push([
        item.name,
        KIND_LABEL[item.kind],
        item.unit,
        item.qty,
        item.minQty ?? '-',
        item.avgCost,
        item.value,
        STOCK_STATUS_LABEL[item.status],
      ]);
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsvWithHistory({
      fileName: `laporan-persediaan-${dateStr}.csv`,
      csvContent: toCsv(rows),
      reportName: 'Laporan Persediaan',
      period: dateStr,
      rowCount: filteredItems.length,
      sourceUrl: '/laporan/persediaan',
    });
  }

  return (
    <>
      <PageHeader
        title="Laporan persediaan"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · Nilai aset stok dan status persediaan saat ini` : undefined}
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={filteredItems.length === 0}
          >
            <Download className="cg-icon" aria-hidden /> Unduh CSV
          </button>
        }
      />

      {stockAsync.status === 'error' && <ErrorBox message={stockAsync.message} onRetry={stockAsync.reload} />}

      {stockAsync.status === 'loading' && (
        <div className="grid gap-8" aria-busy="true" aria-label="Memuat">
          {[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 60 }} />)}
        </div>
      )}

      {stockAsync.status === 'ready' && (
        <>
          {/* Kartu KPI Ringkasan */}
          <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-5 gap-12 mb-16">
            <div className="p-16 rounded-md border border-border bg-surface">
              <span className="text-xs text-text-muted font-medium">Total Nilai Persediaan</span>
              <div className="text-xl font-bold mt-4 cg-num">{formatRp(metrics.totalValue)}</div>
              <span className="text-xs text-text-muted">{metrics.totalItems} jenis item</span>
            </div>
            <div className="p-16 rounded-md border border-border bg-surface">
              <span className="text-xs text-text-muted font-medium">Stok Aman</span>
              <div className="text-xl font-bold mt-4 cg-num text-success-strong">{metrics.okCount} item</div>
              <span className="text-xs text-text-muted">di atas batas aman</span>
            </div>
            <div className="p-16 rounded-md border border-border bg-surface">
              <span className="text-xs text-text-muted font-medium">Stok Menipis</span>
              <div className="text-xl font-bold mt-4 cg-num text-warning-strong">{metrics.lowCount} item</div>
              <span className="text-xs text-text-muted">mendekati batas min</span>
            </div>
            <div className="p-16 rounded-md border border-border bg-surface">
              <span className="text-xs text-text-muted font-medium">Stok Habis</span>
              <div className="text-xl font-bold mt-4 cg-num text-danger-strong">{metrics.outCount} item</div>
              <span className="text-xs text-text-muted">sisa stok 0</span>
            </div>
            <div className="p-16 rounded-md border border-border bg-surface">
              <span className="text-xs text-text-muted font-medium">Stok Minus</span>
              <div className="text-xl font-bold mt-4 cg-num text-danger-strong">{metrics.negativeCount} item</div>
              <span className="text-xs text-text-muted">perlu opname segera</span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-8 mb-12">
            <div className="flex flex-wrap gap-[6px]" role="group" aria-label="Filter status">
              <button
                type="button"
                className="cg-chip"
                aria-pressed={statusFilter === ''}
                onClick={() => setStatusFilter('')}
              >
                Semua ({metrics.totalItems})
              </button>
              <button
                type="button"
                className="cg-chip"
                aria-pressed={statusFilter === 'alert'}
                onClick={() => setStatusFilter('alert')}
              >
                <AlertTriangle className="w-12 h-12" aria-hidden />
                <span>Perlu Perhatian ({metrics.alertCount})</span>
              </button>
              <button
                type="button"
                className="cg-chip"
                aria-pressed={statusFilter === 'low'}
                onClick={() => setStatusFilter('low')}
              >
                Menipis ({metrics.lowCount})
              </button>
              <button
                type="button"
                className="cg-chip"
                aria-pressed={statusFilter === 'out'}
                onClick={() => setStatusFilter('out')}
              >
                Habis ({metrics.outCount})
              </button>
              <button
                type="button"
                className="cg-chip"
                aria-pressed={statusFilter === 'negative'}
                onClick={() => setStatusFilter('negative')}
              >
                Minus ({metrics.negativeCount})
              </button>
              <button
                type="button"
                className="cg-chip"
                aria-pressed={statusFilter === 'ok'}
                onClick={() => setStatusFilter('ok')}
              >
                Aman ({metrics.okCount})
              </button>
            </div>

            <div className="flex items-center gap-8 ml-auto w-full tablet:w-auto">
              <select
                className="cg-input text-xs"
                style={{ width: 'auto' }}
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as '' | StockItem['kind'])}
                aria-label="Filter jenis stok"
              >
                <option value="">Semua Jenis</option>
                <option value="goods">Barang Jadi</option>
                <option value="ingredient">Bahan Baku</option>
              </select>

              <label className="cg-search grow">
                <span className="cg-sr">Cari item persediaan</span>
                <input
                  className="cg-input"
                  type="search"
                  placeholder="Cari nama item..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="cg-empty">
              <Boxes className="cg-icon" aria-hidden />
              <p><strong>{q ? `Tidak ada item yang cocok dengan "${q}".` : 'Tidak ada data persediaan sesuai filter terpilih.'}</strong></p>
              <p className="text-text-muted">Item barang atau bahan baku dengan pelacakan stok aktif akan muncul di sini.</p>
            </div>
          ) : (
            <div className="cg-data-wrap min-w-0">
              <table className="cg-data">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Jenis</th>
                    <th>Satuan</th>
                    <th className="cg-num">Sisa Stok</th>
                    <th className="cg-num">Batas Min</th>
                    <th className="cg-num">Biaya Rata-rata</th>
                    <th className="cg-num">Nilai Persediaan</th>
                    <th style={{ width: '120px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.productId}>
                      <td className="font-semibold break-words">{item.name}</td>
                      <td className="text-text-muted text-sm whitespace-nowrap">{KIND_LABEL[item.kind]}</td>
                      <td className="text-text-muted text-sm">{item.unit}</td>
                      <td className={`cg-num font-semibold ${item.qty < 0 ? 'text-danger-strong' : ''}`}>
                        {fmtQty(item.qty)}
                      </td>
                      <td className="cg-num text-sm text-text-muted">
                        {item.minQty !== undefined ? fmtQty(item.minQty) : '-'}
                      </td>
                      <td className="cg-num text-sm">{formatRp(item.avgCost)}</td>
                      <td className="cg-num font-semibold">{formatRp(item.value)}</td>
                      <td>
                        <span className={`cg-badge ${BADGE[item.status]}`}>
                          {STOCK_STATUS_LABEL[item.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t-2 border-border">
                    <td colSpan={3}>Total ({filteredItems.length} item)</td>
                    <td className="cg-num">
                      {fmtQty(filteredItems.reduce((acc, x) => acc + x.qty, 0))}
                    </td>
                    <td className="cg-num">-</td>
                    <td className="cg-num">-</td>
                    <td className="cg-num">
                      {formatRp(filteredItems.reduce((acc, x) => acc + x.value, 0))}
                    </td>
                    <td>-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

