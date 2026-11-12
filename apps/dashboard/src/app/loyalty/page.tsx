'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Award, Cake, Check, Gift, Pencil, Plus, RotateCcw, Save, Settings2, Users } from 'lucide-react';
import {
  birthdayRuleProblem,
  buildBirthdayCustomersList,
  DEFAULT_LOYALTY,
  DEFAULT_LOYALTY_TIERS,
  earnedPoints,
  formatRp,
  loyaltyRulesProblem,
  loyaltyTierProblem,
  newId,
  redeemAmount,
  summarizeTierDistribution,
  tierForPoints,
  type BirthdayRuleConfig,
  type Customer,
  type LoyaltyRules,
  type LoyaltyTierGroup,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { todayKey, useDialog } from '@/components/fin-common';
import {
  loadBirthdayGrants,
  loadBirthdayRule,
  loadLoyaltyTiers,
  markBirthdayGranted,
  saveBirthdayRule,
  saveLoyaltyTiers,
} from '@/lib/a58-preview';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

type TabKey = 'rules' | 'tiers' | 'birthday';
const digits = (v: string) => v.replace(/\D/g, '');
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtNum = (n: number) => new Intl.NumberFormat('id-ID').format(n);

function TierModal({
  editing,
  existing,
  onClose,
  onSave,
}: {
  editing?: LoyaltyTierGroup;
  existing: LoyaltyTierGroup[];
  onClose: () => void;
  onSave: (tier: LoyaltyTierGroup) => void;
}) {
  const d = useDialog(onClose);
  const [name, setName] = useState(editing?.name ?? '');
  const [minPoints, setMinPoints] = useState(editing ? String(editing.minPoints) : '250');
  const [multiplier, setMultiplier] = useState(editing ? String(editing.earnMultiplier) : '1.5');
  const [benefitNote, setBenefitNote] = useState(editing?.benefitNote ?? '');
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [err, setErr] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsedMin = minPoints.trim() === '' ? -1 : Number(minPoints);
    const parsedMult = Number(multiplier.replace(',', '.'));
    const problem = loyaltyTierProblem(
      { name, minPoints: parsedMin, earnMultiplier: parsedMult },
      existing,
      editing?.id
    );
    if (problem) {
      setErr(problem);
      return;
    }
    onSave({
      id: editing?.id ?? `tier-${newId()}`,
      name: name.trim(),
      minPoints: parsedMin,
      earnMultiplier: Number(parsedMult.toFixed(2)),
      benefitNote: benefitNote.trim() || 'Manfaat tingkat keanggotaan reguler.',
      isActive,
    });
  }

  return (
    <dialog {...d.props} aria-labelledby="tier-modal-title">
      <form onSubmit={submit} noValidate className="grid gap-16 p-20 max-w-[480px]">
        <div className="flex items-start justify-between gap-12">
          <div>
            <h2 id="tier-modal-title" className="text-lg font-bold">
              {editing ? 'Ubah grup loyalti' : 'Tambah grup loyalti'}
            </h2>
            <p className="text-xs text-text-muted">
              Pelanggan masuk ke tingkat tertinggi yang sesuai dengan saldo poinnya.
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

        <div className="cg-field">
          <label className="cg-label" htmlFor="tier-name">
            Nama grup
          </label>
          <input
            id="tier-name"
            className="cg-input"
            placeholder="Contoh: Prioritas"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoFocus
          />
        </div>

        <div className="grid gap-12 tablet:grid-cols-2">
          <div className="cg-field">
            <label className="cg-label" htmlFor="tier-min">
              Minimal poin
            </label>
            <input
              id="tier-min"
              className="cg-input"
              inputMode="numeric"
              value={minPoints}
              onChange={(e) => setMinPoints(digits(e.target.value))}
              maxLength={8}
            />
          </div>
          <div className="cg-field">
            <label className="cg-label" htmlFor="tier-mult">
              Pengali perolehan (x)
            </label>
            <input
              id="tier-mult"
              className="cg-input"
              inputMode="decimal"
              placeholder="1.5"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              maxLength={5}
            />
          </div>
        </div>

        <div className="cg-field">
          <label className="cg-label" htmlFor="tier-note">
            Deskripsi manfaat
          </label>
          <input
            id="tier-note"
            className="cg-input"
            placeholder="Contoh: Bonus 50% poin & prioritas booking"
            value={benefitNote}
            onChange={(e) => setBenefitNote(e.target.value)}
            maxLength={120}
          />
        </div>

        <label className="flex items-center gap-8">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>Aktif</span>
        </label>

        <div className="flex justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary">
            Simpan grup
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function LoyaltyPage() {
  const data = useData();
  const [tab, setTab] = useState<TabKey>('rules');

  // --- State Tab 1: Aturan Poin (server-backed) ---
  const state = useAsync(() => data.getLoyaltyRules(), [data]);
  const [f, setF] = useState({
    isActive: false,
    earnAmount: String(DEFAULT_LOYALTY.earnAmount),
    earnPoints: String(DEFAULT_LOYALTY.earnPoints),
    redeem: String(DEFAULT_LOYALTY.redeemValuePerPoint),
  });
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const loaded = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (loaded) {
      setF({
        isActive: loaded.isActive,
        earnAmount: String(loaded.earnAmount),
        earnPoints: String(loaded.earnPoints),
        redeem: String(loaded.redeemValuePerPoint),
      });
    }
  }, [loaded]);

  const rules: LoyaltyRules = {
    isActive: f.isActive,
    earnAmount: Number(f.earnAmount),
    earnPoints: Number(f.earnPoints),
    redeemValuePerPoint: Number(f.redeem),
  };
  const problem = loyaltyRulesProblem(rules);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (problem) return setErr(problem);
    setBusy(true);
    setErr('');
    setNotice('');
    try {
      await data.saveLoyaltyRules(rules);
      setNotice(
        rules.isActive
          ? 'Aturan poin disimpan dan loyalti aktif.'
          : 'Aturan poin disimpan. Loyalti masih nonaktif.'
      );
      state.reload();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Aturan poin gagal disimpan.');
    } finally {
      setBusy(false);
    }
  }

  // --- Data Pelanggan bersama untuk Tab 2 & Tab 3 ---
  const customersState = useAsync(() => data.listCustomers({ limit: 500 }), [data]);

  // --- State Tab 2: Grup Loyalty (Pratinjau lokal + hitung anggota riil) ---
  const [tiers, setTiers] = useState<LoyaltyTierGroup[]>(() => loadLoyaltyTiers());
  const [tierModal, setTierModal] = useState<{ open: boolean; editing?: LoyaltyTierGroup }>({ open: false });
  const [tierNotice, setTierNotice] = useState('');

  const tierDistribution = useMemo(() => {
    const customers = customersState.status === 'ready' ? customersState.data : [];
    return summarizeTierDistribution(customers, tiers);
  }, [customersState, tiers]);

  function handleSaveTier(saved: LoyaltyTierGroup) {
    setTiers((prev) => {
      const exists = prev.some((t) => t.id === saved.id);
      const next = exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [...prev, saved];
      next.sort((a, b) => a.minPoints - b.minPoints);
      saveLoyaltyTiers(next);
      return next;
    });
    setTierModal({ open: false });
    setTierNotice(`Grup "${saved.name}" disimpan.`);
  }

  function handleResetTiers() {
    saveLoyaltyTiers(DEFAULT_LOYALTY_TIERS);
    setTiers(DEFAULT_LOYALTY_TIERS);
    setTierNotice('Daftar grup dikembalikan ke pengaturan bawaan.');
  }

  // --- State Tab 3: Ulang Tahun (Konfigurasi Pratinjau + Kirim Bonus Manual via adjustPoints) ---
  const [bdayRule, setBdayRule] = useState<BirthdayRuleConfig>(() => loadBirthdayRule());
  const [bdayPointsInput, setBdayPointsInput] = useState(() => String(loadBirthdayRule().bonusPoints));
  const [bdayNoteInput, setBdayNoteInput] = useState(() => loadBirthdayRule().noteTemplate);
  const [bdayActiveInput, setBdayActiveInput] = useState(() => loadBirthdayRule().isActive);
  const [bdayErr, setBdayErr] = useState('');
  const [bdayNotice, setBdayNotice] = useState('');
  const [bdayFilter, setBdayFilter] = useState<'all_birthdates' | 'this_month'>('all_birthdates');
  const [grantsMap, setGrantsMap] = useState<Record<string, number>>(() => loadBirthdayGrants());
  const [grantBusyId, setGrantBusyId] = useState<string | null>(null);

  const today = todayKey();
  const currentYear = Number(today.slice(0, 4)) || 2026;
  const currentMonth = Number(today.slice(5, 7)) || 1;

  function handleSaveBirthdayConfig(e: FormEvent) {
    e.preventDefault();
    setBdayErr('');
    setBdayNotice('');
    const next: BirthdayRuleConfig = {
      isActive: bdayActiveInput,
      bonusPoints: Number(bdayPointsInput || '0'),
      noteTemplate: bdayNoteInput.trim(),
    };
    const errMsg = birthdayRuleProblem(next);
    if (errMsg) {
      setBdayErr(errMsg);
      return;
    }
    saveBirthdayRule(next);
    setBdayRule(next);
    setBdayNotice('Pengaturan bonus ulang tahun disimpan.');
  }

  const birthdayCustomers = useMemo(() => {
    const customers: Customer[] = customersState.status === 'ready' ? customersState.data : [];
    const list = buildBirthdayCustomersList(customers, today, grantsMap);
    return bdayFilter === 'this_month' ? list.filter((x) => x.isThisMonth) : list;
  }, [customersState, today, grantsMap, bdayFilter]);

  async function handleGrantBirthdayBonus(customer: Customer) {
    if (grantBusyId) return;
    if (!bdayRule.isActive) {
      setBdayErr('Aktifkan program bonus ulang tahun terlebih dahulu sebelum mengirim poin.');
      return;
    }
    if (grantsMap[customer.id] === currentYear) {
      setBdayErr(`${customer.name} sudah menerima bonus ulang tahun pada ${currentYear}.`);
      return;
    }

    setGrantBusyId(customer.id);
    setBdayErr('');
    setBdayNotice('');
    try {
      const note = `${bdayRule.noteTemplate} (${currentYear})`;
      const newBalance = await data.adjustPoints(customer.id, bdayRule.bonusPoints, note);
      const nextMap = markBirthdayGranted(customer.id, currentYear);
      setGrantsMap(nextMap);
      setBdayNotice(
        `+${bdayRule.bonusPoints} poin berhasil ditambahkan ke ${customer.name}. Saldo sekarang ${fmtNum(newBalance)} poin.`
      );
      customersState.reload();
    } catch (x) {
      setBdayErr(x instanceof Error ? x.message : 'Gagal memberikan bonus poin ulang tahun.');
    } finally {
      setGrantBusyId(null);
    }
  }

  const sample = 55000;

  return (
    <div className="space-y-16 min-w-0">
      <PageHeader
        title="Poin dan loyalti"
        subtitle="Atur pengumpulan poin belanja, tingkatan grup anggota, serta bonus poin ulang tahun."
      />

      <div className="cg-tabs w-fit max-w-full overflow-x-auto" role="tablist" aria-label="Menu program loyalti">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'rules'}
          className="cg-tab inline-flex items-center gap-8 whitespace-nowrap"
          onClick={() => setTab('rules')}
        >
          <Settings2 className="cg-icon cg-icon--sm" aria-hidden /> Aturan Poin
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tiers'}
          className="cg-tab inline-flex items-center gap-8 whitespace-nowrap"
          onClick={() => setTab('tiers')}
        >
          <Award className="cg-icon cg-icon--sm" aria-hidden /> Grup Loyalty
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'birthday'}
          className="cg-tab inline-flex items-center gap-8 whitespace-nowrap"
          onClick={() => setTab('birthday')}
        >
          <Cake className="cg-icon cg-icon--sm" aria-hidden /> Ulang Tahun
        </button>
      </div>

      {tab === 'rules' && (
        <section aria-label="Aturan poin dasar">
          {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
          {state.status === 'loading' && (
            <div className="cg-skeleton h-[240px]" aria-busy="true" aria-label="Memuat aturan loyalti" />
          )}
          {state.status === 'ready' && (
            <form onSubmit={save} className="grid gap-16 max-w-[560px]" noValidate>
              <label className="flex items-center gap-8">
                <input
                  type="checkbox"
                  checked={f.isActive}
                  onChange={(e) => {
                    setF((s) => ({ ...s, isActive: e.target.checked }));
                    setNotice('');
                  }}
                />
                <strong>Aktifkan loyalti</strong>
              </label>

              <fieldset className="grid gap-12 border-0 p-0">
                <legend className="font-semibold mb-8">Cara mendapat poin</legend>
                <div className="grid gap-12 tablet:grid-cols-2">
                  <div className="cg-field">
                    <label className="cg-label" htmlFor="l-belanja">
                      Setiap belanja (Rp)
                    </label>
                    <input
                      id="l-belanja"
                      className="cg-input"
                      inputMode="numeric"
                      maxLength={9}
                      value={f.earnAmount}
                      onChange={(e) => {
                        setF((s) => ({ ...s, earnAmount: digits(e.target.value) }));
                        setErr('');
                        setNotice('');
                      }}
                    />
                  </div>
                  <div className="cg-field">
                    <label className="cg-label" htmlFor="l-poin">
                      Dapat poin
                    </label>
                    <input
                      id="l-poin"
                      className="cg-input"
                      inputMode="numeric"
                      maxLength={4}
                      value={f.earnPoints}
                      onChange={(e) => {
                        setF((s) => ({ ...s, earnPoints: digits(e.target.value) }));
                        setErr('');
                        setNotice('');
                      }}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="grid gap-12 border-0 p-0">
                <legend className="font-semibold mb-8">Cara menukar poin</legend>
                <div className="cg-field">
                  <label className="cg-label" htmlFor="l-nilai">
                    Nilai 1 poin (Rp)
                  </label>
                  <input
                    id="l-nilai"
                    className="cg-input"
                    inputMode="numeric"
                    maxLength={7}
                    value={f.redeem}
                    onChange={(e) => {
                      setF((s) => ({ ...s, redeem: digits(e.target.value) }));
                      setErr('');
                      setNotice('');
                    }}
                  />
                </div>
              </fieldset>

              <div className="p-16 rounded-xl bg-surface-raised border border-border text-xs text-text-muted grid gap-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-8 font-semibold text-text text-sm">
                    <Gift className="cg-icon cg-icon--sm text-accent" aria-hidden />
                    <span>Penukaran Produk Gratis dari Poin</span>
                  </div>
                  <span className="cg-badge cg-badge--secondary text-[11px]">Menunggu Skema Server</span>
                </div>
                <p>
                  Penukaran poin saat ini berlaku sebagai potongan langsung rupiah pada tagihan kasir. Penukaran poin menjadi produk gratis (katalog hadiah produk per poin) menunggu tabel server <code>loyalty_product_rewards</code> dan validasi penukaran di kasir.
                </p>
              </div>

              <p className="cg-banner cg-banner--info" data-testid="contoh-loyalti">
                {problem
                  ? problem
                  : `Contoh: belanja ${formatRp(sample)} dapat ${earnedPoints(sample, { ...rules, isActive: true })} poin. Menukar 100 poin memotong ${formatRp(redeemAmount(100, rules))}.`}
              </p>

              <p className="text-text-muted text-sm">
                Poin dihitung dari total tagihan saat pesanan lunas, dan hanya untuk pesanan yang punya pelanggan. Bila ada refund, poin ikut dikoreksi sebanding. Mengubah aturan tidak mengubah poin yang sudah ada.
              </p>

              {err && (
                <p role="alert" className="text-danger-strong">
                  {err}
                </p>
              )}
              {notice && (
                <p role="status" className="cg-banner cg-banner--info">
                  {notice}
                </p>
              )}

              <div>
                <button
                  type="submit"
                  className="cg-btn cg-btn--primary"
                  disabled={busy}
                  aria-busy={busy}
                >
                  <Save className="cg-icon" aria-hidden /> {busy ? 'Menyimpan…' : 'Simpan aturan'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {tab === 'tiers' && (
        <section aria-label="Grup keanggotaan loyalti" className="space-y-16 min-w-0">
          <div className="cg-banner cg-banner--info flex flex-wrap items-center justify-between gap-8">
            <p className="text-sm">
              <strong>Pratinjau:</strong> batas poin dan pengali poin per grup tersimpan di peramban sambil menunggu dukungan grup loyalti di server. Jumlah anggota dihitung langsung dari saldo poin pelanggan saat ini.
            </p>
            <span className="cg-badge cg-badge--info whitespace-nowrap">Hitungan langsung</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-8">
            <div className="text-sm text-text-muted flex items-center gap-8">
              <Users className="cg-icon cg-icon--sm" aria-hidden />
              {customersState.status === 'ready'
                ? `${fmtNum(customersState.data.length)} pelanggan terdaftar`
                : 'Memuat daftar pelanggan…'}
            </div>
            <div className="flex flex-wrap items-center gap-8">
              <button type="button" className="cg-btn cg-btn--secondary" onClick={handleResetTiers}>
                <RotateCcw className="cg-icon cg-icon--sm" aria-hidden /> Reset bawaan
              </button>
              <button
                type="button"
                className="cg-btn cg-btn--primary"
                onClick={() => setTierModal({ open: true })}
              >
                <Plus className="cg-icon" aria-hidden /> Tambah grup
              </button>
            </div>
          </div>

          {tierNotice && (
            <p role="status" className="cg-banner cg-banner--info">
              {tierNotice}
            </p>
          )}

          {customersState.status === 'error' && (
            <ErrorBox message={customersState.message} onRetry={customersState.reload} />
          )}

          <div className="cg-data-wrap min-w-0">
            <table className="cg-data">
              <thead>
                <tr>
                  <th>Grup</th>
                  <th className="text-right">Minimal poin</th>
                  <th className="text-right">Pengali poin</th>
                  <th className="text-right">Anggota</th>
                  <th>Manfaat</th>
                  <th>Status</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {tierDistribution.rows.map(({ tier, memberCount }) => (
                  <tr key={tier.id}>
                    <td className="font-semibold whitespace-nowrap">{tier.name}</td>
                    <td className="text-right cg-num whitespace-nowrap">{fmtNum(tier.minPoints)} poin</td>
                    <td className="text-right cg-num whitespace-nowrap">{tier.earnMultiplier}x</td>
                    <td className="text-right cg-num whitespace-nowrap">{fmtNum(memberCount)}</td>
                    <td className="break-words max-w-[260px] text-sm text-text-muted">{tier.benefitNote}</td>
                    <td>
                      <span className={`cg-badge ${tier.isActive ? 'cg-badge--success' : ''}`}>
                        {tier.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="cg-btn cg-btn--ghost cg-btn--sm"
                        onClick={() => setTierModal({ open: true, editing: tier })}
                        aria-label={`Ubah grup ${tier.name}`}
                      >
                        <Pencil className="cg-icon cg-icon--sm" aria-hidden /> Ubah
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {customersState.status === 'ready' && customersState.data.length > 0 && (
            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-12 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-8">
                <h2 className="text-base font-semibold">Pemetaan pelanggan per grup saat ini</h2>
                <Link href="/pelanggan" className="text-sm underline">
                  Kelola pelanggan
                </Link>
              </div>
              <ul className="grid gap-8 tablet:grid-cols-2">
                {customersState.data.slice(0, 8).map((c) => {
                  const matched = tierForPoints(c.pointsBalance, tiers);
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-12 border border-border rounded-lg p-12 min-w-0"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{c.name}</div>
                        <div className="text-xs text-text-muted cg-num">{fmtNum(c.pointsBalance)} poin</div>
                      </div>
                      <span className="cg-badge cg-badge--accent whitespace-nowrap">
                        {matched ? matched.name : 'Tanpa grup'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {tierModal.open && (
            <TierModal
              editing={tierModal.editing}
              existing={tiers}
              onClose={() => setTierModal({ open: false })}
              onSave={handleSaveTier}
            />
          )}
        </section>
      )}

      {tab === 'birthday' && (
        <section aria-label="Bonus poin ulang tahun" className="space-y-16 min-w-0">
          <div className="cg-banner cg-banner--info flex flex-wrap items-center justify-between gap-8">
            <p className="text-sm">
              <strong>Pratinjau &amp; Pemberian Langsung:</strong> pengiriman otomatis harian menunggu dukungan penjadwal server. Anda dapat langsung mengirim bonus poin ulang tahun ke pelanggan lewat tombol di tabel (langsung masuk buku poin server).
            </p>
            <span className="cg-badge cg-badge--info whitespace-nowrap">Kirim manual aktif</span>
          </div>

          <form
            onSubmit={handleSaveBirthdayConfig}
            noValidate
            className="border border-border rounded-xl bg-surface-raised p-16 space-y-12 max-w-[640px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-8">
              <h2 className="text-base font-semibold">Aturan Bonus Ulang Tahun</h2>
              <label className="flex items-center gap-8 text-sm">
                <input
                  type="checkbox"
                  checked={bdayActiveInput}
                  onChange={(e) => setBdayActiveInput(e.target.checked)}
                />
                <span>Aktifkan program bonus</span>
              </label>
            </div>

            <div className="grid gap-12 tablet:grid-cols-2">
              <div className="cg-field">
                <label className="cg-label" htmlFor="bday-points">
                  Jumlah bonus poin
                </label>
                <input
                  id="bday-points"
                  className="cg-input"
                  inputMode="numeric"
                  maxLength={6}
                  value={bdayPointsInput}
                  onChange={(e) => setBdayPointsInput(digits(e.target.value))}
                />
              </div>

              <div className="cg-field">
                <label className="cg-label" htmlFor="bday-note">
                  Catatan mutasi poin
                </label>
                <input
                  id="bday-note"
                  className="cg-input"
                  maxLength={120}
                  value={bdayNoteInput}
                  onChange={(e) => setBdayNoteInput(e.target.value)}
                />
              </div>
            </div>

            {bdayErr && (
              <p role="alert" className="cg-banner cg-banner--danger">
                {bdayErr}
              </p>
            )}
            {bdayNotice && (
              <p role="status" className="cg-banner cg-banner--info">
                {bdayNotice}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-8">
              <button type="submit" className="cg-btn cg-btn--primary">
                <Save className="cg-icon" aria-hidden /> Simpan pengaturan ulang tahun
              </button>
            </div>
          </form>

          <div className="space-y-12 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-12">
              <div>
                <h2 className="text-base font-semibold">Pelanggan dengan Tanggal Lahir</h2>
                <p className="text-xs text-text-muted">
                  Bulan aktif: {MONTHS_ID[currentMonth - 1]} {currentYear}. Satu pelanggan dibatasi maksimal satu kali bonus per tahun.
                </p>
              </div>
              <div className="cg-tabs" role="tablist" aria-label="Filter pelanggan ulang tahun">
                <button
                  type="button"
                  role="tab"
                  aria-selected={bdayFilter === 'all_birthdates'}
                  className="cg-tab"
                  onClick={() => setBdayFilter('all_birthdates')}
                >
                  Semua bertanggal lahir
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={bdayFilter === 'this_month'}
                  className="cg-tab"
                  onClick={() => setBdayFilter('this_month')}
                >
                  Bulan {MONTHS_ID[currentMonth - 1]} ini
                </button>
              </div>
            </div>

            {customersState.status === 'error' && (
              <ErrorBox message={customersState.message} onRetry={customersState.reload} />
            )}

            {customersState.status === 'loading' && (
              <div className="cg-skeleton h-[180px]" aria-busy="true" aria-label="Memuat pelanggan" />
            )}

            {customersState.status === 'ready' && birthdayCustomers.length === 0 && (
              <div className="cg-empty">
                <Cake className="cg-icon text-text-muted mx-auto mb-8" aria-hidden />
                <p>
                  <strong>
                    {bdayFilter === 'this_month'
                      ? `Belum ada pelanggan yang berulang tahun di bulan ${MONTHS_ID[currentMonth - 1]}.`
                      : 'Belum ada pelanggan yang memiliki data tanggal lahir.'}
                  </strong>
                </p>
                <p className="text-text-muted text-sm">
                  Tambahkan tanggal lahir di menu Pelanggan agar muncul di daftar penerima bonus.
                </p>
                <Link href="/pelanggan" className="cg-btn cg-btn--secondary mt-8">
                  Buka Data Pelanggan
                </Link>
              </div>
            )}

            {customersState.status === 'ready' && birthdayCustomers.length > 0 && (
              <div className="cg-data-wrap min-w-0">
                <table className="cg-data">
                  <thead>
                    <tr>
                      <th>Pelanggan</th>
                      <th>Tanggal lahir</th>
                      <th className="text-right">Saldo poin</th>
                      <th>Status tahun {currentYear}</th>
                      <th className="text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {birthdayCustomers.map((row) => (
                      <tr key={row.customer.id}>
                        <td className="min-w-[160px] max-w-[240px]">
                          <div className="font-semibold break-words">{row.customer.name}</div>
                          <div className="text-xs text-text-muted">{row.customer.phone ?? 'Tanpa nomor HP'}</div>
                        </td>
                        <td className="whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-8">
                            <span>
                              {String(row.day).padStart(2, '0')} {MONTHS_ID[row.month - 1]}
                              {row.ageThisYear !== null ? ` (${row.ageThisYear} thn)` : ''}
                            </span>
                            {row.isToday && <span className="cg-badge cg-badge--success">Hari ini</span>}
                            {!row.isToday && row.isThisMonth && (
                              <span className="cg-badge cg-badge--info">Bulan ini</span>
                            )}
                          </div>
                        </td>
                        <td className="text-right cg-num whitespace-nowrap font-semibold">
                          {fmtNum(row.customer.pointsBalance)} poin
                        </td>
                        <td className="whitespace-nowrap">
                          {row.alreadyGrantedThisYear ? (
                            <span className="cg-badge cg-badge--success inline-flex items-center gap-4">
                              <Check className="cg-icon cg-icon--sm" aria-hidden /> Sudah diberikan {currentYear}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted">Belum menerima</span>
                          )}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="cg-btn cg-btn--secondary cg-btn--sm"
                            disabled={
                              row.alreadyGrantedThisYear ||
                              grantBusyId === row.customer.id ||
                              !bdayRule.isActive
                            }
                            aria-busy={grantBusyId === row.customer.id}
                            onClick={() => void handleGrantBirthdayBonus(row.customer)}
                          >
                            {grantBusyId === row.customer.id
                              ? 'Mengirim…'
                              : row.alreadyGrantedThisYear
                                ? 'Sudah diterima'
                                : `Berikan +${bdayRule.bonusPoints} poin`}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
