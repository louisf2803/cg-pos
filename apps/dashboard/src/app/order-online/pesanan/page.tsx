'use client';
import { useState } from 'react';
import { ShoppingCart, RefreshCw, Filter } from 'lucide-react';
import { PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';

type OrderOnlineStatus = 'masuk' | 'diproses' | 'dikirim' | 'diterima' | 'selesai' | 'batal';

export default function PesananOnlinePage() {
  const { ctx, value, setValue, range, today } = useReport();
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
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : 'Kelola pesanan dari saluran pesan-antar dan order mandiri'}
        actions={
          <button className="cg-btn cg-btn--secondary" onClick={() => window.location.reload()}>
            <RefreshCw className="cg-icon" aria-hidden /> Segarkan
          </button>
        }
      />

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
                role="tab"
                aria-selected={active}
                className={`flex items-center gap-6 px-12 py-8 rounded-md font-medium text-sm whitespace-nowrap transition-colors ${
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
        <div className="cg-empty py-40 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center text-text-muted mb-12">
            <ShoppingCart className="w-8 h-8" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold mb-4">Belum ada pesanan online masuk</h2>
          <p className="text-text-muted max-w-md text-sm">
            Pesanan dari saluran online terintegrasi (GrabFood, GoFood, ShopeeFood, atau Order Mandiri QR) akan langsung muncul di halaman ini secara waktu-nyata.
          </p>
        </div>
      </div>
    </div>
  );
}
