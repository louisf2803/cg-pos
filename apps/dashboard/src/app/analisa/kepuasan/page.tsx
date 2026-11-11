'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, MessageSquareHeart, Star, Tag, ThumbsUp } from 'lucide-react';
import {
  computeSatisfactionSummary,
  SAMPLE_SATISFACTION_ITEMS,
  type SatisfactionFeedbackItem,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { loadSatisfactionFollowups, saveSatisfactionFollowups } from '@/lib/a60-preview';
import { useReport } from '@/lib/use-report';

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso));

export default function AnalisaKepuasanPage() {
  const { ctx, value, setValue, range, today, state } = useReport();
  const [channelFilter, setChannelFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState<'all' | 'high' | 'low'>('all');
  const [followups, setFollowups] = useState<Record<string, string>>({});

  useEffect(() => {
    setFollowups(loadSatisfactionFollowups());
  }, []);

  const filteredItems: SatisfactionFeedbackItem[] = useMemo(() => {
    return SAMPLE_SATISFACTION_ITEMS.filter((item) => {
      if (channelFilter !== 'all' && item.channelLabel !== channelFilter) return false;
      if (ratingFilter === 'high' && item.rating < 4) return false;
      if (ratingFilter === 'low' && item.rating > 3) return false;
      return true;
    });
  }, [channelFilter, ratingFilter]);

  const summary = useMemo(() => computeSatisfactionSummary(filteredItems), [filteredItems]);

  function toggleFollowup(id: string) {
    const next = { ...followups };
    if (next[id]) delete next[id];
    else next[id] = 'Sudah ditindaklanjuti manajer outlet';
    setFollowups(next);
    saveSatisfactionFollowups(next);
  }

  const channels = ['all', 'Dine-in', 'Takeaway', 'CG Order QR Meja', 'Pesan-Antar'];

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Kepuasan pelanggan"
        subtitle={
          ctx.status === 'ready'
            ? `${ctx.data.outletName} · ${range.label}`
            : 'Pantau indeks kepuasan, ulasan pesanan, dan topik penilaian pelanggan'
        }
      />

      <div className="cg-banner cg-banner--info flex flex-wrap items-center justify-between gap-8">
        <p className="text-sm">
          <strong>Pratinjau:</strong> fitur ulasan pelanggan belum ada, menunggu keputusan apakah pelanggan bisa memberi rating setelah transaksi. Panel di bawah menampilkan data contoh untuk validasi tata letak laporan (docs/REQUESTS-FOR-CLAUDE.md).
        </p>
        <span className="cg-badge cg-badge--info whitespace-nowrap">Pratinjau · Data Contoh</span>
      </div>

      <RangePicker value={value} today={today} onChange={setValue} />

      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}

      <div className="flex flex-wrap items-center gap-12">
        <label className="flex items-center gap-8 text-sm">
          <span className="text-text-muted">Saluran:</span>
          <select
            className="cg-select"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            aria-label="Filter saluran ulasan"
          >
            <option value="all">Semua saluran</option>
            {channels
              .filter((c) => c !== 'all')
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
        </label>

        <div className="cg-tabs max-w-full overflow-x-auto" role="tablist" aria-label="Filter tingkat rating">
          <button
            type="button"
            role="tab"
            aria-selected={ratingFilter === 'all'}
            className="cg-tab whitespace-nowrap"
            onClick={() => setRatingFilter('all')}
          >
            Semua
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={ratingFilter === 'high'}
            className="cg-tab whitespace-nowrap"
            onClick={() => setRatingFilter('high')}
          >
            Puas (4–5 ★)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={ratingFilter === 'low'}
            className="cg-tab whitespace-nowrap"
            onClick={() => setRatingFilter('low')}
          >
            Perlu atensi (≤ 3 ★)
          </button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="cg-empty">
          <MessageSquareHeart className="cg-icon text-text-muted mx-auto mb-8" aria-hidden />
          <p>
            <strong>Tidak ada ulasan pada filter ini.</strong>
          </p>
          <p className="text-text-muted text-sm">
            Ubah filter saluran atau rentang rating untuk melihat contoh tanggapan pelanggan.
          </p>
        </div>
      ) : (
        <div className="space-y-24 min-w-0">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12" aria-label="Ringkasan kepuasan">
            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted text-sm">
                <span>Skor rata-rata</span>
                <Star className="w-[16px] h-[16px] text-accent" aria-hidden />
              </div>
              <strong className="block text-2xl font-bold cg-num" data-testid="kepuasan-avg-score">
                {summary.avgScore.toFixed(1)} / 5,0
              </strong>
              <span className="block text-xs text-text-muted">Berdasarkan {summary.totalCount} ulasan contoh</span>
            </div>

            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted text-sm">
                <span>Tingkat kepuasan</span>
                <ThumbsUp className="w-[16px] h-[16px] text-accent" aria-hidden />
              </div>
              <strong className="block text-2xl font-bold cg-num" data-testid="kepuasan-pct">
                {summary.satisfiedPct}%
              </strong>
              <span className="block text-xs text-text-muted">Menilai 4 atau 5 bintang</span>
            </div>

            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted text-sm">
                <span>Topik terbanyak</span>
                <Tag className="w-[16px] h-[16px] text-accent" aria-hidden />
              </div>
              <strong className="block text-lg font-bold truncate text-accent-strong">
                {summary.topTags[0]?.tag ?? '—'}
              </strong>
              <span className="block text-xs text-text-muted">
                {summary.topTags[0] ? `Disebut di ${summary.topTags[0].count} ulasan` : 'Belum ada data'}
              </span>
            </div>
          </div>

          <div className="grid gap-16 desktop:grid-cols-2 min-w-0">
            <section className="border border-border rounded-xl bg-surface-raised p-16 space-y-12 min-w-0">
              <h2 className="text-base font-semibold">Distribusi Bintang</h2>
              <ul className="grid gap-8">
                {summary.byRating.map((b) => (
                  <li key={b.score} className="grid grid-cols-[64px_1fr_72px] items-center gap-8 text-sm">
                    <span className="cg-num font-medium">{b.score} ★</span>
                    <span className="block h-[12px] rounded-pill bg-accent-soft" aria-hidden>
                      <span
                        className="block h-full rounded-pill bg-accent"
                        style={{ width: `${b.pct}%` }}
                      />
                    </span>
                    <span className="text-right cg-num text-text-muted whitespace-nowrap">
                      {b.count} ({b.pct}%)
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="border border-border rounded-xl bg-surface-raised p-16 space-y-12 min-w-0">
              <h2 className="text-base font-semibold">Topik Umpan Balik</h2>
              <div className="flex flex-wrap gap-8">
                {summary.topTags.map((t) => (
                  <span key={t.tag} className="cg-badge cg-badge--accent">
                    {t.tag} · {t.count}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <section aria-label="Daftar tanggapan pelanggan" className="space-y-12 min-w-0">
            <h2 className="text-base font-semibold">Ulasan Terbaru (Contoh)</h2>
            <div className="grid gap-12">
              {filteredItems.map((item) => {
                const handled = Boolean(followups[item.id]);
                return (
                  <article
                    key={item.id}
                    className="border border-border rounded-xl bg-surface-raised p-16 space-y-8 min-w-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-8">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-8">
                          <strong className="font-semibold">{item.customerName}</strong>
                          <span className="cg-badge cg-badge--info">{item.channelLabel}</span>
                          <span
                            className={`cg-badge ${item.rating >= 4 ? 'cg-badge--success' : 'cg-badge--warning'}`}
                          >
                            {item.rating} ★
                          </span>
                        </div>
                        <p className="text-xs text-text-muted mt-4">
                          {item.orderNumber} · {fmtDateTime(item.createdAt)}
                        </p>
                      </div>

                      <button
                        type="button"
                        className={`cg-btn cg-btn--sm ${handled ? 'cg-btn--secondary' : 'cg-btn--ghost'}`}
                        onClick={() => toggleFollowup(item.id)}
                      >
                        <Check className="cg-icon cg-icon--sm" aria-hidden />
                        {handled ? 'Sudah ditindaklanjuti' : 'Tandai ditindaklanjuti'}
                      </button>
                    </div>

                    <p className="text-sm break-words">{item.comment}</p>

                    <div className="flex flex-wrap gap-4">
                      {item.tags.map((tag) => (
                        <span key={tag} className="cg-badge">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

