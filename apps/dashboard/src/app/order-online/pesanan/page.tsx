'use client';
import { useState } from 'react';
import { Globe, ShoppingCart, RefreshCw, Filter } from 'lucide-react';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { OrderOnlineChannelsPanel } from '@/components/order-online-channels';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

type OrderOnlineStatus = 'masuk' | 'diproses' | 'dikirim' | 'diterima' | 'selesai' | 'batal';

export default function PesananOnlinePage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const { value, setValue, range, today } = useRange(ctx.status === 'ready' ? ctx.data.timezone : undefined);
  const [mainTab, setMainTab] = useState<'pesanan' | 'kanal'>('pesanan');
  const [activeStatus, setActiveStatus] = useState<OrderOnlineStatus>('masuk');
  const [selectedChannel, setSelectedChannel] = useState('semua');
  const [q, setQ] = useState('');

  const channels = [
    { id: 'semua', label: 'Semua Saluran' },
    { id: 'grabfood', label: 'GrabFood' },
    { id: 'gofood', label: 'GoFood' },
    { id: 'shopeefood', label: 'ShopeeFood' },
    { id: 'mandiri', label: 'Order Mandiri' },
  ];

  const statusTabs: { id: OrderOnlineStatus; label: string; count: number }[] = [
    { id: 'masuk', label: 'Masuk', count: 0 },
    { id: 'diproses', label: 'Diproses', count: 0 },
    { id: 'dikirim', label: 'Dikirim', count: 0 },
    { id: 'diterima', label: 'Diterima', count: 0 },
    { id: 'selesai', label: 'Selesai', count: 0 },
    { id: 'batal', label: 'Batal / Refund', count: 0 },
  ];

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Pesanan Online"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : 'Kelola pesanan dari saluran pesan-antar dan order mandiri CG Order'}
        actions={
          <button type="button" className="cg-btn cg-btn--secondary" onClick={() => ctx.reload()}>
            <RefreshCw className="cg-icon" aria-hidden /> Segarkan
          </button>
        }
      />

      <div className="cg-tabs w-fit max-w-full overflow-x-auto" role="tablist" aria-label="Menu Order Online CG Order">
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'pesanan'}
          className="cg-tab inline-flex items-center gap-8 whitespace-nowrap"
          onClick={() => setMainTab('pesanan')}
        >
          <ShoppingCart className="cg-icon cg-icon--sm" aria-hidden /> Pesanan Masuk
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'kanal'}
          className="cg-tab inline-flex items-center gap-8 whitespace-nowrap"
          onClick={() => setMainTab('kanal')}
        >
          <Globe className="cg-icon cg-icon--sm" aria-hidden /> Status Kanal
        </button>
      </div>

      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}

      {mainTab === 'kanal' ? (
        <OrderOnlineChannelsPanel />
      ) : ctx.status === 'loading' ? (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat pesanan online">
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton" style={{ height: 84 }} />
            ))}
          </div>
          <div className="cg-skeleton" style={{ height: 200 }} />
        </div>
      ) : ctx.status === 'ready' ? (
        <>
      <RangePicker value={value} today={today} onChange={setValue} />

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-12">
        <div className="flex flex-wrap items-center gap-8" role="group" aria-label="Filter saluran penjualan">
          <span className="flex items-center gap-4 text-xs font-semibold text-text-muted uppercase">
            <Filter className="cg-icon cg-icon--sm" aria-hidden /> Saluran:
          </span>
          {channels.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className="cg-chip"
              aria-pressed={selectedChannel === ch.id}
              onClick={() => setSelectedChannel(ch.id)}
            >
              {ch.label}
            </button>
          ))}
        </div>

        <label className="cg-search flex-1 max-w-sm min-w-[200px]">
          <span className="cg-sr">Cari nomor pesanan atau nama pelanggan</span>
          <input
            className="cg-input"
            type="search"
            placeholder="Cari pesanan online..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      {/* 4 Kartu Hitung Nol dengan garis warna di bawah */}
      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-12">
        <div className="cg-card p-16 flex flex-col justify-between border-b-4 border-info min-w-0">
          <span className="text-sm font-medium text-text-muted">Pesanan Masuk</span>
          <div className="mt-8 flex items-baseline justify-between">
            <span className="text-2xl font-bold">0</span>
            <span className="text-xs text-text-muted">Menunggu konfirmasi</span>
          </div>
        </div>

        <div className="cg-card p-16 flex flex-col justify-between border-b-4 border-warning min-w-0">
          <span className="text-sm font-medium text-text-muted">Sedang Diproses</span>
          <div className="mt-8 flex items-baseline justify-between">
            <span className="text-2xl font-bold">0</span>
            <span className="text-xs text-text-muted">Di dapur / disiapkan</span>
          </div>
        </div>

        <div className="cg-card p-16 flex flex-col justify-between border-b-4 border-accent min-w-0">
          <span className="text-sm font-medium text-text-muted">Dalam Pengiriman</span>
          <div className="mt-8 flex items-baseline justify-between">
            <span className="text-2xl font-bold">0</span>
            <span className="text-xs text-text-muted">Menunggu kurir / di jalan</span>
          </div>
        </div>

        <div className="cg-card p-16 flex flex-col justify-between border-b-4 border-success min-w-0">
          <span className="text-sm font-medium text-text-muted">Pesanan Selesai</span>
          <div className="mt-8 flex items-baseline justify-between">
            <span className="text-2xl font-bold">0</span>
            <span className="text-xs text-text-muted">Tuntas terkirim</span>
          </div>
        </div>
      </div>

      {/* Tab Status Bar */}
      <div className="cg-card p-16 grid gap-16 min-w-0">
        <div className="flex items-center gap-8 border-b border-border pb-8 overflow-x-auto" role="tablist">
          {statusTabs.map((tab) => {
            const active = activeStatus === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`flex items-center gap-8 px-12 py-8 rounded-md font-medium text-sm whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-accent-soft text-accent-strong font-semibold'
                    : 'text-text-muted hover:text-text hover:bg-surface'
                }`}
                onClick={() => setActiveStatus(tab.id)}
              >
                <span>{tab.label}</span>
                <span className={`cg-badge ${active ? 'cg-badge--primary' : 'cg-badge--neutral'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Keadaan Kosong */}
        <div className="cg-empty py-32 text-center flex flex-col items-center justify-center">
          <div className="w-40 h-40 rounded-full bg-surface flex items-center justify-center text-text-muted mb-12">
            <ShoppingCart className="w-24 h-24" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold mb-4">Belum ada pesanan online masuk</h2>
          <p className="text-text-muted max-w-md text-sm">
            Pesanan dari saluran online terintegrasi (CG Order QR, Mitra Pesan-Antar, atau Aplikasi Konsumen) akan langsung muncul di halaman ini secara waktu-nyata.
          </p>
        </div>
      </div>
        </>
      ) : null}
    </div>
  );
}
