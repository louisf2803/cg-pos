'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Clock,
  Globe,
  PauseCircle,
  PlayCircle,
  QrCode,
  Settings2,
  Smartphone,
  Store,
} from 'lucide-react';
import {
  DEFAULT_ONLINE_CHANNELS,
  onlineChannelProblem,
  ONLINE_STATUS_LABELS,
  summarizeOnlineChannels,
  type OnlineChannelConfig,
  type OnlineChannelId,
  type OnlineChannelStatus,
} from '@cgpos/shared';
import { useDialog } from '@/components/fin-common';
import { PageHeader } from '@/components/page';
import { loadOnlineChannels, saveOnlineChannels } from '@/lib/a59-preview';

const digits = (v: string) => v.replace(/\D/g, '');

function channelIcon(id: OnlineChannelId) {
  if (id === 'mandiri') return <QrCode className="cg-icon" aria-hidden />;
  if (id === 'delivery') return <Store className="cg-icon" aria-hidden />;
  if (id === 'kios') return <Smartphone className="cg-icon" aria-hidden />;
  return <Globe className="cg-icon" aria-hidden />;
}

function statusBadgeClass(status: OnlineChannelStatus): string {
  if (status === 'active') return 'cg-badge--success';
  if (status === 'paused') return 'cg-badge--warning';
  return '';
}

function ChannelModal({
  channel,
  onClose,
  onSave,
}: {
  channel: OnlineChannelConfig;
  onClose: () => void;
  onSave: (updated: OnlineChannelConfig) => void;
}) {
  const d = useDialog(onClose);
  const [status, setStatus] = useState<OnlineChannelStatus>(channel.status);
  const [autoAccept, setAutoAccept] = useState(channel.autoAccept);
  const [prepMinutes, setPrepMinutes] = useState(String(channel.prepMinutes));
  const [priceMarkupPct, setPriceMarkupPct] = useState(String(channel.priceMarkupPct));
  const [openHours, setOpenHours] = useState(channel.openHours);
  const [storefrontSlug, setStorefrontSlug] = useState(channel.storefrontSlug ?? '');
  const [err, setErr] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsedPrep = Number(prepMinutes || '0');
    const parsedMarkup = Number((priceMarkupPct || '0').replace(',', '.'));
    const problem = onlineChannelProblem({
      name: channel.name,
      prepMinutes: parsedPrep,
      priceMarkupPct: parsedMarkup,
      openHours,
    });
    if (problem) {
      setErr(problem);
      return;
    }

    onSave({
      ...channel,
      status,
      autoAccept,
      prepMinutes: parsedPrep,
      priceMarkupPct: Number(parsedMarkup.toFixed(1)),
      openHours: openHours.trim(),
      storefrontSlug: storefrontSlug.trim() || undefined,
    });
  }

  return (
    <dialog {...d.props} aria-labelledby="ch-modal-title">
      <form onSubmit={submit} noValidate className="grid gap-16 p-20 max-w-[520px]">
        <div className="flex items-start justify-between gap-12">
          <div>
            <h2 id="ch-modal-title" className="text-lg font-bold">
              Pengaturan {channel.name}
            </h2>
            <p className="text-xs text-text-muted">{channel.categoryLabel}</p>
          </div>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onClose}>
            Tutup
          </button>
        </div>

        {err && (
          <div className="cg-banner cg-banner--danger" role="alert">
            {err}
          </div>
        )}

        <div className="cg-field">
          <label className="cg-label" htmlFor="ch-status">
            Status penerimaan pesanan
          </label>
          <select
            id="ch-status"
            className="cg-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as OnlineChannelStatus)}
          >
            <option value="active">{ONLINE_STATUS_LABELS.active}</option>
            <option value="paused">{ONLINE_STATUS_LABELS.paused}</option>
            <option value="setup">{ONLINE_STATUS_LABELS.setup}</option>
          </select>
        </div>

        <div className="grid gap-12 tablet:grid-cols-2">
          <div className="cg-field">
            <label className="cg-label" htmlFor="ch-prep">
              Waktu persiapan (menit)
            </label>
            <input
              id="ch-prep"
              className="cg-input"
              inputMode="numeric"
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(digits(e.target.value))}
              maxLength={3}
            />
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="ch-markup">
              Penyesuaian harga (%)
            </label>
            <input
              id="ch-markup"
              className="cg-input"
              inputMode="decimal"
              value={priceMarkupPct}
              onChange={(e) => setPriceMarkupPct(e.target.value)}
              maxLength={5}
            />
          </div>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="ch-hours">
            Jam operasional kanal
          </label>
          <input
            id="ch-hours"
            className="cg-input"
            placeholder="08:00 - 22:00"
            value={openHours}
            onChange={(e) => setOpenHours(e.target.value)}
            maxLength={40}
          />
        </div>

        {(channel.id === 'mandiri' || channel.id === 'aplikasi') && (
          <div className="cg-field">
            <label className="cg-label" htmlFor="ch-slug">
              Tautan kode outlet CG Order (opsional)
            </label>
            <input
              id="ch-slug"
              className="cg-input"
              placeholder="outlet-utama"
              value={storefrontSlug}
              onChange={(e) => setStorefrontSlug(e.target.value)}
              maxLength={40}
            />
          </div>
        )}

        <label className="flex items-center gap-8">
          <input
            type="checkbox"
            checked={autoAccept}
            onChange={(e) => setAutoAccept(e.target.checked)}
          />
          <span>Terima pesanan baru secara otomatis ke antrean dapur</span>
        </label>

        <div className="flex justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary">
            Simpan kanal
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function OrderOnlineChannelsPanel({
  focusChannel,
}: {
  focusChannel?: OnlineChannelId;
}) {
  const [channels, setChannels] = useState<OnlineChannelConfig[]>(DEFAULT_ONLINE_CHANNELS);
  const [editing, setEditing] = useState<OnlineChannelConfig | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setChannels(loadOnlineChannels());
  }, []);

  const summary = useMemo(() => summarizeOnlineChannels(channels), [channels]);

  const orderedChannels = useMemo(() => {
    if (!focusChannel) return channels;
    const hit = channels.find((c) => c.id === focusChannel);
    if (!hit) return channels;
    return [hit, ...channels.filter((c) => c.id !== focusChannel)];
  }, [channels, focusChannel]);

  function updateChannel(updated: OnlineChannelConfig, statusMsg?: string) {
    const next = channels.map((c) => (c.id === updated.id ? updated : c));
    setChannels(next);
    saveOnlineChannels(next);
    setNotice(statusMsg ?? `Pengaturan ${updated.name} diperbarui.`);
  }

  function handleQuickStatus(ch: OnlineChannelConfig, nextStatus: OnlineChannelStatus) {
    updateChannel(
      { ...ch, status: nextStatus },
      `${ch.name} diubah ke status: ${ONLINE_STATUS_LABELS[nextStatus]}.`
    );
  }

  return (
    <div className="space-y-16 min-w-0">
      <div className="cg-banner cg-banner--info flex flex-wrap items-center justify-between gap-8">
        <p className="text-sm">
          <strong>Pratinjau Status Kanal CG Order:</strong> status buka/jeda, waktu persiapan, dan penyesuaian harga per saluran tersimpan di peramban sambil menunggu koneksi webhook order daring di server.
        </p>
        <span className="cg-badge cg-badge--info whitespace-nowrap">Pratinjau · Kanal lokal</span>
      </div>

      {notice && (
        <p role="status" className="cg-banner cg-banner--info">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
        <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
          <span className="text-xs text-text-muted">Kanal aktif menerima order</span>
          <strong className="block text-xl font-bold cg-num" data-testid="cg-order-active-count">
            {summary.activeCount} dari {summary.total}
          </strong>
        </div>
        <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
          <span className="text-xs text-text-muted">Sedang dijeda sementara</span>
          <strong className="block text-xl font-bold cg-num">{summary.pausedCount} kanal</strong>
        </div>
        <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
          <span className="text-xs text-text-muted">Belum terhubung</span>
          <strong className="block text-xl font-bold cg-num">{summary.setupCount} kanal</strong>
        </div>
      </div>

      <div className="grid gap-12">
        {orderedChannels.map((ch) => {
          const isFocused = focusChannel === ch.id;
          return (
            <article
              key={ch.id}
              className={`border rounded-xl bg-surface-raised p-16 space-y-12 min-w-0 ${
                isFocused ? 'border-accent' : 'border-border'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-12">
                <div className="flex items-start gap-12 min-w-0">
                  <div className="w-[40px] h-[40px] rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
                    {channelIcon(ch.id)}
                  </div>
                  <div className="min-w-0 space-y-4">
                    <div className="flex flex-wrap items-center gap-8">
                      <h2 className="text-base font-bold break-words">{ch.name}</h2>
                      <span className={`cg-badge ${statusBadgeClass(ch.status)}`}>
                        {ONLINE_STATUS_LABELS[ch.status]}
                      </span>
                      {isFocused && (
                        <span className="cg-badge cg-badge--accent">Kanal terpilih</span>
                      )}
                    </div>
                    <p className="text-sm text-text-muted break-words">{ch.description}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-8 shrink-0">
                  {ch.status !== 'active' ? (
                    <button
                      type="button"
                      className="cg-btn cg-btn--primary cg-btn--sm"
                      onClick={() => handleQuickStatus(ch, 'active')}
                    >
                      <PlayCircle className="cg-icon cg-icon--sm" aria-hidden /> Aktifkan
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="cg-btn cg-btn--secondary cg-btn--sm"
                      onClick={() => handleQuickStatus(ch, 'paused')}
                    >
                      <PauseCircle className="cg-icon cg-icon--sm" aria-hidden /> Jeda
                    </button>
                  )}
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm"
                    onClick={() => setEditing(ch)}
                  >
                    <Settings2 className="cg-icon cg-icon--sm" aria-hidden /> Atur
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 tablet:grid-cols-4 gap-8 text-sm border-t border-border pt-12">
                <div>
                  <span className="block text-xs text-text-muted">Jam layanan</span>
                  <span className="font-semibold cg-num">{ch.openHours}</span>
                </div>
                <div>
                  <span className="block text-xs text-text-muted">Estimasi siap</span>
                  <span className="font-semibold cg-num inline-flex items-center gap-4">
                    <Clock className="cg-icon cg-icon--sm text-text-muted" aria-hidden />
                    {ch.prepMinutes} menit
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-text-muted">Selisih harga</span>
                  <span className="font-semibold cg-num">
                    {ch.priceMarkupPct > 0 ? `+${ch.priceMarkupPct}%` : 'Sesuai menu outlet'}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-text-muted">Konfirmasi order</span>
                  <span className="font-semibold inline-flex items-center gap-4">
                    <CheckCircle2 className="cg-icon cg-icon--sm text-text-muted" aria-hidden />
                    {ch.autoAccept ? 'Otomatis' : 'Manual kasir'}
                  </span>
                </div>
              </div>

              {ch.storefrontSlug && (
                <div className="flex flex-wrap items-center justify-between gap-8 text-xs text-text-muted bg-surface rounded-lg p-12 border border-border">
                  <span className="break-all">
                    Tautan pratinjau CG Order: <strong>cg-order/{ch.storefrontSlug}</strong>
                  </span>
                  <Link href="/order-online/pesanan" className="underline whitespace-nowrap">
                    Lihat pesanan masuk
                  </Link>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {editing && (
        <ChannelModal
          channel={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            updateChannel(updated);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

export function OrderOnlineChannelPage({
  focusChannel,
  title,
  subtitle,
}: {
  focusChannel: OnlineChannelId;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-16 min-w-0">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Link href="/order-online/pesanan" className="cg-btn cg-btn--secondary">
            Daftar pesanan masuk
          </Link>
        }
      />
      <OrderOnlineChannelsPanel focusChannel={focusChannel} />
    </div>
  );
}
