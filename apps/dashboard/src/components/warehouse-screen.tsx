'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Package, RefreshCw, Search, XCircle } from 'lucide-react';
import { buildWarehouseQueue, formatRp, type WarehouseFilter } from '@cgpos/shared';
import { ErrorBox } from '@/components/page';
import {
  jakartaTodayKey,
  loadWarehousePreparedIds,
  saveWarehousePreparedIds,
} from '@/lib/a60-preview';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

const fmtQty = (n: number) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n);

export function WarehouseScreen() {
  const data = useData();
  const stockState = useAsync(() => data.listStock(), [data]);
  const [filter, setFilter] = useState<WarehouseFilter>('all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [todayKey, setTodayKey] = useState('');
  const [preparedIds, setPreparedIds] = useState<string[]>([]);

  useEffect(() => {
    const day = jakartaTodayKey();
    setTodayKey(day);
    setPreparedIds(loadWarehousePreparedIds(day));
  }, []);

  function togglePrepared(productId: string) {
    const day = todayKey || jakartaTodayKey();
    const exists = preparedIds.includes(productId);
    const next = exists
      ? preparedIds.filter((id) => id !== productId)
      : [...preparedIds, productId];
    setTodayKey(day);
    setPreparedIds(next);
    saveWarehousePreparedIds(day, next);
  }

  const categories = useMemo(() => {
    if (stockState.status !== 'ready') return [];
    const seen = new Map<string, string>();
    for (const item of stockState.data) {
      if (item.categoryId && item.categoryName && !seen.has(item.categoryId)) {
        seen.set(item.categoryId, item.categoryName);
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [stockState]);

  const queue = useMemo(() => {
    if (stockState.status !== 'ready') return null;
    return buildWarehouseQueue(stockState.data, filter, search, categoryId);
  }, [stockState, filter, search, categoryId]);

  return (
    <section aria-label="Layar gudang" className="space-y-16 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-12">
        <div>
          <h2 className="text-base font-bold">Pantauan Stok Gudang &amp; Restok</h2>
          <p className="text-xs text-text-muted">
            Menampilkan kondisi persediaan langsung dari server. Item habis dan menipis diprioritaskan paling atas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-8">
          <span className="cg-badge cg-badge--info whitespace-nowrap">
            Disiapkan hari ini: {preparedIds.length}
          </span>
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm"
            onClick={stockState.reload}
            disabled={stockState.status === 'loading'}
          >
            <RefreshCw className="cg-icon cg-icon--sm" aria-hidden /> Segarkan stok
          </button>
          <Link href="/inventori/opname" className="cg-btn cg-btn--secondary cg-btn--sm">
            Stok opname
          </Link>
          <Link href="/inventori/pembelian" className="cg-btn cg-btn--primary cg-btn--sm">
            Buat pembelian
          </Link>
        </div>
      </div>

      {stockState.status === 'error' && (
        <ErrorBox message={stockState.message} onRetry={stockState.reload} />
      )}

      {stockState.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat layar gudang">
          <div className="grid grid-cols-1 tablet:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-[76px] rounded-xl" />
            ))}
          </div>
          <div className="cg-skeleton h-[220px] rounded-xl" />
        </div>
      )}

      {queue && (
        <>
          <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-12">
            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Stok habis</span>
                <XCircle className="cg-icon cg-icon--sm text-danger-strong" aria-hidden />
              </div>
              <strong className="block text-xl font-bold cg-num text-danger-strong" data-testid="gudang-out-count">
                {queue.summary.outCount} item
              </strong>
            </div>

            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Stok menipis</span>
                <AlertTriangle className="cg-icon cg-icon--sm text-accent" aria-hidden />
              </div>
              <strong className="block text-xl font-bold cg-num" data-testid="gudang-low-count">
                {queue.summary.lowCount} item
              </strong>
            </div>

            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Stok aman</span>
                <CheckCircle2 className="cg-icon cg-icon--sm text-accent" aria-hidden />
              </div>
              <strong className="block text-xl font-bold cg-num">{queue.summary.okCount} item</strong>
            </div>

            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Total nilai persediaan</span>
                <Package className="cg-icon cg-icon--sm text-text-muted" aria-hidden />
              </div>
              <strong className="block text-xl font-bold cg-num">
                {formatRp(queue.summary.totalValuation)}
              </strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-12">
            <label className="cg-search flex-1 min-w-[200px]">
              <Search className="cg-icon cg-icon--sm" aria-hidden />
              <span className="cg-sr">Cari barang atau bahan baku</span>
              <input
                className="cg-input"
                type="search"
                placeholder="Cari nama item, satuan, atau kategori bahan baku"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>

            {categories.length > 0 && (
              <select
                className="cg-select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-label="Filter kategori bahan baku"
              >
                <option value="">Semua kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <div className="cg-tabs max-w-full overflow-x-auto" role="tablist" aria-label="Filter status gudang">
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'all'}
                className="cg-tab whitespace-nowrap"
                onClick={() => setFilter('all')}
              >
                Semua ({queue.summary.totalItems})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'low_or_out'}
                className="cg-tab whitespace-nowrap"
                onClick={() => setFilter('low_or_out')}
              >
                Perlu restok ({queue.summary.outCount + queue.summary.lowCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'ingredient'}
                className="cg-tab whitespace-nowrap"
                onClick={() => setFilter('ingredient')}
              >
                Bahan baku
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'goods'}
                className="cg-tab whitespace-nowrap"
                onClick={() => setFilter('goods')}
              >
                Produk jual
              </button>
            </div>
          </div>

          {queue.rows.length === 0 ? (
            <div className="cg-empty">
              <Package className="cg-icon text-text-muted mx-auto mb-8" aria-hidden />
              <p>
                <strong>Tidak ada item persediaan yang cocok dengan filter ini.</strong>
              </p>
              <p className="text-text-muted text-sm">
                Coba ubah tab status atau bersihkan kata kunci pencarian.
              </p>
            </div>
          ) : (
            <div className="cg-data-wrap min-w-0">
              <table className="cg-data">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">Siap hari ini</th>
                    <th>Item persediaan</th>
                    <th>Jenis &amp; kategori</th>
                    <th className="text-right">Stok tersedia</th>
                    <th className="text-right">Batas minimum</th>
                    <th>Status</th>
                    <th className="text-right">Nilai stok</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.rows.map((item) => {
                    const isPrepared = preparedIds.includes(item.productId);
                    return (
                    <tr key={item.productId}>
                      <td className="whitespace-nowrap">
                        <label className="inline-flex items-center gap-8 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isPrepared}
                            onChange={() => togglePrepared(item.productId)}
                            aria-label={`Tandai siap ${item.name}`}
                          />
                          <span className={isPrepared ? 'text-accent font-medium' : 'text-text-muted'}>
                            {isPrepared ? 'Sudah disiapkan' : 'Belum'}
                          </span>
                        </label>
                      </td>
                      <td className="min-w-[180px] max-w-[280px]">
                        <div className="font-semibold break-words">{item.name}</div>
                        <div className="text-xs text-text-muted">Satuan: {item.unit}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-4">
                          <span className="cg-badge">
                            {item.kind === 'ingredient' ? 'Bahan baku' : 'Produk jual'}
                          </span>
                          {item.categoryName && (
                            <span className="cg-badge cg-badge--info">{item.categoryName}</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right cg-num whitespace-nowrap font-semibold">
                        {fmtQty(item.qty)} {item.unit}
                      </td>
                      <td className="text-right cg-num whitespace-nowrap text-text-muted">
                        {typeof item.minQty === 'number' ? `${fmtQty(item.minQty)} ${item.unit}` : '—'}
                      </td>
                      <td className="whitespace-nowrap">
                        {(item.status === 'out' || item.status === 'negative') && (
                          <span className="cg-badge cg-badge--danger">
                            {item.status === 'negative' ? 'Minus' : 'Habis'}
                          </span>
                        )}
                        {item.status === 'low' && (
                          <span className="cg-badge cg-badge--warning">Menipis</span>
                        )}
                        {item.status === 'ok' && (
                          <span className="cg-badge cg-badge--success">Aman</span>
                        )}
                      </td>
                      <td className="text-right cg-num whitespace-nowrap">
                        {formatRp(item.value)}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
