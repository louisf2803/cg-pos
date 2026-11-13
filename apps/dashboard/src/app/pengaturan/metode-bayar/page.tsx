'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Calculator, CreditCard, Lock, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
import {
  CHANNEL_LABELS,
  computePaymentFee,
  formatRp,
  parseRp,
  paymentMethodProblem,
  type PaymentChannelKind,
  type PaymentMethodConfig,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

const CHANNELS: PaymentChannelKind[] = ['cash', 'qris', 'ewallet', 'edc', 'va', 'complimentary'];
const digits = (v: string) => v.replace(/\D/g, '');

function MethodModal({
  editing,
  existing,
  onClose,
  onSave,
}: {
  editing?: PaymentMethodConfig;
  existing: PaymentMethodConfig[];
  onClose: () => void;
  onSave: (saved: {
    id?: string;
    name: string;
    code: string;
    channel: PaymentChannelKind;
    isActive: boolean;
    feePct: number;
    feeFixed: number;
    accountName?: string;
    accountNumber?: string;
    settlementNote?: string;
  }) => void;
}) {
  const d = useDialog(onClose);
  const isBuiltIn = Boolean(editing?.isBuiltIn);
  const isGateway = editing?.baseKind === 'gateway';
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [channel, setChannel] = useState<PaymentChannelKind>(editing?.channel ?? 'edc');
  const [isActive, setIsActive] = useState(isGateway ? false : (editing?.isActive ?? true));
  const [feePct, setFeePct] = useState(editing ? String(editing.feePct) : '0');
  const [feeFixed, setFeeFixed] = useState(editing ? String(editing.feeFixed) : '0');
  const [accountName, setAccountName] = useState(editing?.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState(editing?.accountNumber ?? '');
  const [settlementNote, setSettlementNote] = useState(editing?.settlementNote ?? '');
  const [err, setErr] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsedPct = Number((feePct || '0').replace(',', '.'));
    const parsedFixed = feeFixed.trim() === '' ? 0 : parseRp(feeFixed);
    const problem = paymentMethodProblem(
      {
        name,
        code,
        channel,
        feePct: parsedPct,
        feeFixed: parsedFixed,
        accountNumber,
        settlementNote,
      },
      existing,
      editing?.id
    );
    if (problem) {
      setErr(problem);
      return;
    }

    onSave({
      id: editing?.id,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      channel,
      isActive: isGateway ? false : isActive,
      feePct: Number(parsedPct.toFixed(2)),
      feeFixed: parsedFixed,
      accountName: accountName.trim() || undefined,
      accountNumber: accountNumber.trim() || undefined,
      settlementNote: settlementNote.trim() || undefined,
    });
  }

  return (
    <dialog {...d.props} aria-labelledby="pm-modal-title">
      <form onSubmit={submit} noValidate className="grid gap-16 p-20 max-w-[540px]">
        <div className="flex items-start justify-between gap-12">
          <div>
            <h2 id="pm-modal-title" className="text-lg font-bold">
              {editing ? 'Ubah metode pembayaran' : 'Tambah metode pembayaran'}
            </h2>
            <p className="text-xs text-text-muted">
              Atur nama tampil di kasir, biaya potongan (MDR), dan keterangan pencairan.
            </p>
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

        {isGateway && (
          <div className="cg-banner cg-banner--info text-xs">
            Gateway pembayaran daring (seperti QRIS otomatis) menunggu integrasi server dan dinonaktifkan pada mode pratinjau.
          </div>
        )}

        <div className="grid gap-12 tablet:grid-cols-2">
          <div className="cg-field">
            <label className="cg-label" htmlFor="pm-name">
              Nama metode
            </label>
            <input
              id="pm-name"
              className="cg-input"
              placeholder="Contoh: Kartu Debit BCA"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
            />
          </div>

          <div className="cg-field">
            <label className="cg-label" htmlFor="pm-code">
              Kode
            </label>
            <input
              id="pm-code"
              className="cg-input"
              placeholder="EDC_BCA"
              value={code}
              disabled={isBuiltIn}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={20}
            />
          </div>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="pm-channel">
            Kategori kanal
          </label>
          <select
            id="pm-channel"
            className="cg-select"
            value={channel}
            disabled={isBuiltIn && (editing?.baseKind === 'cash' || editing?.baseKind === 'complimentary')}
            onChange={(e) => setChannel(e.target.value as PaymentChannelKind)}
          >
            {CHANNELS.filter((k) => k !== 'qris' || editing?.channel === 'qris').map((k) => (
              <option key={k} value={k}>
                {CHANNEL_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-12 tablet:grid-cols-2">
          <div className="cg-field">
            <label className="cg-label" htmlFor="pm-pct">
              Potongan MDR (%)
            </label>
            <input
              id="pm-pct"
              className="cg-input"
              inputMode="decimal"
              value={feePct}
              onChange={(e) => setFeePct(e.target.value)}
              maxLength={6}
            />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="pm-fixed">
              Biaya tetap per transaksi (Rp)
            </label>
            <input
              id="pm-fixed"
              className="cg-input"
              inputMode="numeric"
              value={feeFixed}
              onChange={(e) => setFeeFixed(digits(e.target.value))}
              maxLength={7}
            />
          </div>
        </div>

        <div className="grid gap-12 tablet:grid-cols-2">
          <div className="cg-field">
            <label className="cg-label" htmlFor="pm-acc-name">
              Bank / penyedia (opsional)
            </label>
            <input
              id="pm-acc-name"
              className="cg-input"
              placeholder="Contoh: Bank Mandiri / EDC Konter"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              maxLength={60}
            />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="pm-acc-num">
              Nomor terminal / rekening (opsional)
            </label>
            <input
              id="pm-acc-num"
              className="cg-input"
              placeholder="Hanya untuk referensi kasir"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              maxLength={40}
            />
          </div>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="pm-note">
            Catatan pencairan / kasir (opsional)
          </label>
          <input
            id="pm-note"
            className="cg-input"
            placeholder="Contoh: Dana masuk H+1 ke rekening operasional"
            value={settlementNote}
            onChange={(e) => setSettlementNote(e.target.value)}
            maxLength={160}
          />
        </div>

        {!isGateway && editing?.baseKind !== 'cash' && (
          <label className="flex items-center gap-8">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Aktif digunakan di kasir</span>
          </label>
        )}

        <div className="flex justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary">
            Simpan metode
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function MetodeBayarPage() {
  const data = useData();
  const state = useAsync(() => data.listPaymentMethodConfigs(), [data]);

  const [channelFilter, setChannelFilter] = useState<'all' | PaymentChannelKind>('all');
  const [search, setSearch] = useState('');
  const [simAmount, setSimAmount] = useState('100000');
  const [modal, setModal] = useState<{ open: boolean; editing?: PaymentMethodConfig }>({
    open: false,
  });
  const [notice, setNotice] = useState('');

  const allMethods = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data;
  }, [state]);

  const filteredMethods = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMethods.filter((m) => {
      if (channelFilter !== 'all' && m.channel !== channelFilter) return false;
      if (q) {
        const hay = `${m.name} ${m.code} ${m.accountName ?? ''} ${m.settlementNote ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allMethods, channelFilter, search]);

  async function handleSaveModal(saved: {
    id?: string;
    name: string;
    code: string;
    channel: PaymentChannelKind;
    isActive: boolean;
    feePct: number;
    feeFixed: number;
    accountName?: string;
    accountNumber?: string;
    settlementNote?: string;
  }) {
    try {
      await data.savePaymentMethodConfig(saved);
      setModal({ open: false });
      setNotice(`Metode "${saved.name}" berhasil disimpan.`);
      state.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menyimpan metode pembayaran');
    }
  }

  async function handleToggle(method: PaymentMethodConfig) {
    if (method.baseKind === 'gateway' || method.baseKind === 'cash') return;
    try {
      await data.togglePaymentMethodActive(method.id, !method.isActive);
      setNotice(`${method.name} ${!method.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
      state.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal mengubah status metode');
    }
  }

  async function handleDeleteCustom(method: PaymentMethodConfig) {
    if (method.isBuiltIn) return;
    try {
      await data.deletePaymentMethodConfig(method.id);
      setNotice(`Metode tambahan "${method.name}" dihapus.`);
      state.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus metode pembayaran');
    }
  }

  const parsedSim = Number(simAmount || '0');
  const activeCount = allMethods.filter((m) => m.isActive).length;
  const nonCashActive = allMethods.filter((m) => m.isActive && m.channel !== 'cash').length;
  const feeConfiguredCount = allMethods.filter((m) => m.feePct > 0 || m.feeFixed > 0).length;

  return (
    <div className="space-y-16 min-w-0">
      <PageHeader
        title="Metode pembayaran"
        subtitle="Kelola saluran tunai, kartu EDC, transfer bank, dompet digital, dan simulasi biaya MDR."
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            onClick={() => setModal({ open: true })}
          >
            <Plus className="cg-icon" aria-hidden /> Tambah metode
          </button>
        }
      />

      {notice && (
        <p role="status" className="cg-banner cg-banner--info">
          {notice}
        </p>
      )}

      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}

      {state.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat metode pembayaran">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[76px] rounded-xl" />
            ))}
          </div>
          <div className="cg-skeleton h-[240px] rounded-xl" />
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <span className="text-xs text-text-muted">Metode aktif</span>
              <strong className="block text-xl font-bold cg-num">{activeCount} metode</strong>
            </div>
            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <span className="text-xs text-text-muted">Saluran non-tunai aktif</span>
              <strong className="block text-xl font-bold cg-num">{nonCashActive} saluran</strong>
            </div>
            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <span className="text-xs text-text-muted">Memiliki potongan MDR / biaya</span>
              <strong className="block text-xl font-bold cg-num">{feeConfiguredCount} metode</strong>
            </div>
          </div>

          <div className="border border-border rounded-xl bg-surface-raised p-16 flex flex-wrap items-center justify-between gap-12">
            <div className="flex items-center gap-8 text-sm">
              <Calculator className="cg-icon text-accent" aria-hidden />
              <div>
                <strong>Simulasi perhitungan MDR</strong>
                <span className="block text-xs text-text-muted">
                  Lihat perkiraan potongan dan dana bersih diterima per transaksi.
                </span>
              </div>
            </div>
            <label className="flex items-center gap-8 text-sm">
              <span>Nilai tagihan (Rp)</span>
              <input
                aria-label="Nominal simulasi MDR"
                className="cg-input w-[140px] cg-num text-right"
                inputMode="numeric"
                value={simAmount}
                onChange={(e) => setSimAmount(digits(e.target.value))}
                maxLength={10}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-12">
            <label className="cg-search flex-1 min-w-[200px]">
              <Search className="cg-icon cg-icon--sm" aria-hidden />
              <span className="cg-sr">Cari metode pembayaran</span>
              <input
                className="cg-input"
                type="search"
                placeholder="Cari nama, kode, atau bank penyedia"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>

            <div className="cg-tabs max-w-full overflow-x-auto" role="tablist" aria-label="Filter kanal pembayaran">
              <button
                type="button"
                role="tab"
                aria-selected={channelFilter === 'all'}
                className="cg-tab whitespace-nowrap"
                onClick={() => setChannelFilter('all')}
              >
                Semua
              </button>
              {CHANNELS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={channelFilter === k}
                  className="cg-tab whitespace-nowrap"
                  onClick={() => setChannelFilter(k)}
                >
                  {CHANNEL_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {filteredMethods.length === 0 ? (
            <div className="cg-empty">
              <CreditCard className="cg-icon text-text-muted mx-auto mb-8" aria-hidden />
              <p>
                <strong>Tidak ada metode pembayaran yang cocok.</strong>
              </p>
              <p className="text-text-muted text-sm">
                Ubah filter kategori atau tambahkan metode EDC/Transfer baru.
              </p>
            </div>
          ) : (
            <div className="cg-data-wrap min-w-0">
              <table className="cg-data">
                <thead>
                  <tr>
                    <th>Metode pembayaran</th>
                    <th>Kanal & sumber</th>
                    <th className="text-right">Potongan (MDR)</th>
                    <th className="text-right">Bersih dari {formatRp(parsedSim)}</th>
                    <th>Status</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMethods.map((m) => {
                    const sim = computePaymentFee(parsedSim, m);
                    const isGateway = m.baseKind === 'gateway';
                    const isCash = m.baseKind === 'cash';
                    return (
                      <tr key={m.id}>
                        <td className="min-w-[180px] max-w-[260px]">
                          <div className="font-semibold break-words">{m.name}</div>
                          <div className="text-xs text-text-muted break-words">
                            Kode {m.code}
                            {m.accountName ? ` · ${m.accountName}` : ''}
                            {m.accountNumber ? ` (${m.accountNumber})` : ''}
                          </div>
                          {m.settlementNote && (
                            <div className="text-xs text-text-muted break-words mt-4">
                              {m.settlementNote}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-4">
                            <span className="cg-badge">{CHANNEL_LABELS[m.channel]}</span>
                            <span className={`cg-badge ${m.isBuiltIn ? 'cg-badge--info' : ''}`}>
                              {m.isBuiltIn ? 'Bawaan server' : 'Lokal'}
                            </span>
                          </div>
                        </td>
                        <td className="text-right cg-num whitespace-nowrap">
                          {m.feePct === 0 && m.feeFixed === 0
                            ? 'Bebas biaya'
                            : `${m.feePct}%${m.feeFixed > 0 ? ` + ${formatRp(m.feeFixed)}` : ''}`}
                        </td>
                        <td className="text-right cg-num whitespace-nowrap">
                          <strong>{formatRp(sim.net)}</strong>
                          {sim.fee > 0 && (
                            <span className="block text-xs text-text-muted">
                              potongan {formatRp(sim.fee)}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap">
                          {isGateway ? (
                            <span className="cg-badge cg-badge--warning inline-flex items-center gap-4">
                              <Lock className="cg-icon cg-icon--sm" aria-hidden /> Menunggu gateway
                            </span>
                          ) : (
                            <span className={`cg-badge ${m.isActive ? 'cg-badge--success' : ''}`}>
                              {m.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          )}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-4">
                            <button
                              type="button"
                              className="cg-btn cg-btn--ghost cg-btn--sm"
                              onClick={() => setModal({ open: true, editing: m })}
                              aria-label={`Ubah ${m.name}`}
                            >
                              <Pencil className="cg-icon cg-icon--sm" aria-hidden /> Ubah
                            </button>
                            {!isGateway && !isCash && (
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm"
                                onClick={() => handleToggle(m)}
                                aria-label={`${m.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${m.name}`}
                              >
                                <Power className="cg-icon cg-icon--sm" aria-hidden />
                                {m.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                              </button>
                            )}
                            {!m.isBuiltIn && (
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm text-danger-strong"
                                onClick={() => handleDeleteCustom(m)}
                                aria-label={`Hapus ${m.name}`}
                              >
                                <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                              </button>
                            )}
                          </div>
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

      {modal.open && (
        <MethodModal
          editing={modal.editing}
          existing={allMethods}
          onClose={() => setModal({ open: false })}
          onSave={handleSaveModal}
        />
      )}
    </div>
  );
}

