'use client';

import { useState, useMemo, useEffect, type FormEvent } from 'react';
import {
  Printer,
  Check,
  RotateCcw,
  Store,
  Layers,
  FileText,
  Info,
  ShieldAlert,
  Image as ImageIcon,
  QrCode,
  Share2,
  Trash2,
} from 'lucide-react';
import {
  PRINT_THEMES,
  DEFAULT_RECEIPT_TEMPLATE,
  MAX_PRINTS_LIMIT,
  QR_CODE_TYPES,
  resolveReceiptTemplate,
  receiptTemplateProblem,
  receiptPieces,
  themeCols,
  formatRp,
  paperCols,
  type PrintTheme,
  type QrCodeType,
  type ReceiptTemplate,
  type OutletInfo,
  type OutletOptions,
  type Order,
  type OutletContext,
  type PaperWidth,
} from '@cgpos/shared';
import { PageHeader, ErrorBox } from '@/components/page';
import { LINE_TOGGLE_KEYS, LineToggleGroup, type LineToggles } from '@/components/struk/line-toggles';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

type Tab = 'header' | 'body' | 'footer';

// Data pesanan contoh untuk pratinjau langsung
const SAMPLE_ORDER: Order = {
  id: 'sample-ord-1',
  number: 'OUT1/A/261111/042',
  type: 'dine_in',
  label: 'Meja 3',
  guestCount: 2,
  customerName: 'Budi Santoso',
  cashierId: 'e-sari',
  tableId: 't-3',
  status: 'paid',
  openedAt: '2026-11-11T03:00:00.000Z',
  closedAt: '2026-11-11T03:15:00.000Z',
  items: [
    {
      id: 'it-1',
      productId: 'p-kopi',
      name: 'Kopi Susu Gula Aren',
      qty: 2,
      unitPrice: 22000,
      lineTotal: 44000,
      note: 'kurang manis, es sedikit',
      extras: [{ optionId: 'ex-1', name: 'Extra espresso shot', price: 5000 }],
    },
    {
      id: 'it-2',
      productId: 'p-roti',
      name: 'Roti Bakar Cokelat Keju',
      qty: 1,
      unitPrice: 18000,
      lineTotal: 18000,
      note: 'panggang garing',
      extras: [],
    },
  ],
  subtotal: 67000,
  discountTotal: 5000,
  serviceCharge: 3100,
  taxTotal: 6510,
  rounding: 0,
  total: 71610,
  paidTotal: 100000,
  payments: [
    {
      id: 'pay-1',
      methodId: 'm-cash',
      methodName: 'Tunai',
      kind: 'cash',
      amount: 100000,
      tendered: 100000,
      change: 28390,
      paidAt: '2026-11-11T03:15:00.000Z',
    },
  ],
};

export default function ReceiptSettingsPage() {
  const data = useData();
  const st = useAsync(() => data.getOutletSettings(), [data]);

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Tampilan Struk Pelanggan"
        subtitle="Atur tata letak, ukuran huruf, rincian transaksi, dan batasan cetak ulang struk kasir"
        helpText="Pengaturan ini berlaku untuk semua struk pesanan yang dicetak dari aplikasi kasir di outlet Anda."
      />

      {st.status === 'error' && <ErrorBox message={st.message} onRetry={st.reload} />}
      {st.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat">
          <div className="cg-skeleton h-[48px]" />
          <div className="grid grid-cols-1 laptop:grid-cols-12 gap-24">
            <div className="laptop:col-span-7 cg-skeleton h-[360px]" />
            <div className="laptop:col-span-5 cg-skeleton h-[360px]" />
          </div>
        </div>
      )}
      {st.status === 'ready' && (
        <ReceiptEditor
          info={st.data.info}
          options={st.data.options}
          onSaved={st.reload}
        />
      )}
    </div>
  );
}

function ReceiptEditor({
  info,
  options,
  onSaved,
}: {
  info: OutletInfo;
  options: OutletOptions;
  onSaved: () => void;
}) {
  const data = useData();

  // Inisialisasi templat dari pengaturan outlet
  const initialTpl = useMemo(() => resolveReceiptTemplate(options), [options]);

  const [activeTab, setActiveTab] = useState<Tab>('header');
  const [theme, setTheme] = useState<PrintTheme>(initialTpl.theme);
  const [paper, setPaper] = useState<PaperWidth>('58');
  const [defaultPaperWidth, setDefaultPaperWidth] = useState<PaperWidth>(initialTpl.defaultPaperWidth);

  // Header tab states
  const [showLogo, setShowLogo] = useState(initialTpl.showLogo ?? false);
  const [logoUrl, setLogoUrl] = useState(initialTpl.logoUrl ?? '');
  const [showOutletName, setShowOutletName] = useState(initialTpl.showOutletName);
  const [showAddress, setShowAddress] = useState(initialTpl.showAddress);
  const [showPhone, setShowPhone] = useState(initialTpl.showPhone);
  const [receiptHeader, setReceiptHeader] = useState(options.receiptHeader ?? '');

  // Transaction info states
  const [showOrderNo, setShowOrderNo] = useState(initialTpl.showOrderNo);
  const [showOrderType, setShowOrderType] = useState(initialTpl.showOrderType);
  const [showTable, setShowTable] = useState(initialTpl.showTable);
  const [showGuests, setShowGuests] = useState(initialTpl.showGuests);
  const [showTime, setShowTime] = useState(initialTpl.showTime);
  const [showCashier, setShowCashier] = useState(initialTpl.showCashier);
  const [showCustomer, setShowCustomer] = useState(initialTpl.showCustomer);

  // Body tab states
  const [showUnitPrice, setShowUnitPrice] = useState(initialTpl.showUnitPrice);
  const [showExtras, setShowExtras] = useState(initialTpl.showExtras);
  const [showNotes, setShowNotes] = useState(initialTpl.showNotes);
  const [lineToggles, setLineToggles] = useState<LineToggles>(() => Object.fromEntries(LINE_TOGGLE_KEYS.map((k) => [k, initialTpl[k]])) as LineToggles);
  const [showQrCode, setShowQrCode] = useState(initialTpl.showQrCode ?? false);
  const [qrCodeType, setQrCodeType] = useState<QrCodeType>(initialTpl.qrCodeType ?? 'order_no');
  const [qrCodeCustomUrl, setQrCodeCustomUrl] = useState(initialTpl.qrCodeCustomUrl ?? '');
  const [showBarcode, setShowBarcode] = useState(initialTpl.showBarcode ?? false);

  // Footer tab states
  const [receiptFooter, setReceiptFooter] = useState(options.receiptFooter ?? '');
  const [showSocialMedia, setShowSocialMedia] = useState(initialTpl.showSocialMedia ?? false);
  const [instagram, setInstagram] = useState(initialTpl.socialMedia?.instagram ?? '');
  const [facebook, setFacebook] = useState(initialTpl.socialMedia?.facebook ?? '');
  const [website, setWebsite] = useState(initialTpl.socialMedia?.website ?? '');
  const [showPrintTime, setShowPrintTime] = useState(initialTpl.showPrintTime);

  // Print limits states
  const [enableLimit, setEnableLimit] = useState(initialTpl.maxPrints > 0);
  const [maxPrints, setMaxPrints] = useState(initialTpl.maxPrints > 0 ? initialTpl.maxPrints : 3);

  // Action status
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (ok) {
      const t = setTimeout(() => setOk(false), 4000);
      return () => clearTimeout(t);
    }
  }, [ok]);

  // Bangun objek ReceiptTemplate terkini
  const currentTemplate: ReceiptTemplate = useMemo(() => ({
    theme,
    showOutletName,
    showAddress,
    showPhone,
    showOrderNo,
    showOrderType,
    showTable,
    showGuests,
    showTime,
    showCashier,
    showCustomer,
    showUnitPrice,
    showExtras,
    showNotes,
    showPrintTime,
    ...lineToggles,
    maxPrints: enableLimit ? maxPrints : 0,
    defaultPaperWidth,
    showLogo,
    logoUrl,
    showSocialMedia,
    socialMedia: { instagram, facebook, website },
    showQrCode,
    qrCodeType,
    qrCodeCustomUrl,
    showBarcode,
  }), [
    lineToggles,
    theme,
    showOutletName,
    showAddress,
    showPhone,
    showOrderNo,
    showOrderType,
    showTable,
    showGuests,
    showTime,
    showCashier,
    showCustomer,
    showUnitPrice,
    showExtras,
    showNotes,
    showPrintTime,
    enableLimit,
    maxPrints,
    defaultPaperWidth,
    showLogo,
    logoUrl,
    showSocialMedia,
    instagram,
    facebook,
    website,
    showQrCode,
    qrCodeType,
    qrCodeCustomUrl,
    showBarcode,
  ]);

  // Context pratinjau yang reaktif terhadap perubahan formulir
  const previewCtx: OutletContext = useMemo(() => ({
    outletId: info.code || 'out-1',
    outletName: info.name,
    outletCode: info.code,
    address: info.address,
    phone: info.phone,
    timezone: info.timezone || 'Asia/Jakarta',
    receiptHeader,
    receiptFooter,
    receiptShowCashier: showCashier,
    receiptShowCustomer: showCustomer,
    receiptTemplate: currentTemplate,
  } as unknown as OutletContext), [info, receiptHeader, receiptFooter, showCashier, showCustomer, currentTemplate]);

  // Hitung potongan teks pratinjau struk dari pesanan contoh
  const previewCols = paperCols(paper);
  const previewPieces = useMemo(() => {
    return receiptPieces({
      order: SAMPLE_ORDER,
      ctx: previewCtx,
      cashierName: 'Sari Wijaya',
      kind: 'receipt',
      cols: previewCols,
      printedAt: '2026-11-11T03:15:30.000Z',
    });
  }, [previewCtx, previewCols]);

  const handleResetDefaults = () => {
    setTheme(DEFAULT_RECEIPT_TEMPLATE.theme);
    setShowOutletName(DEFAULT_RECEIPT_TEMPLATE.showOutletName);
    setShowAddress(DEFAULT_RECEIPT_TEMPLATE.showAddress);
    setShowPhone(DEFAULT_RECEIPT_TEMPLATE.showPhone);
    setShowOrderNo(DEFAULT_RECEIPT_TEMPLATE.showOrderNo);
    setShowOrderType(DEFAULT_RECEIPT_TEMPLATE.showOrderType);
    setShowTable(DEFAULT_RECEIPT_TEMPLATE.showTable);
    setShowGuests(DEFAULT_RECEIPT_TEMPLATE.showGuests);
    setShowTime(DEFAULT_RECEIPT_TEMPLATE.showTime);
    setShowCashier(DEFAULT_RECEIPT_TEMPLATE.showCashier);
    setShowCustomer(DEFAULT_RECEIPT_TEMPLATE.showCustomer);
    setShowUnitPrice(DEFAULT_RECEIPT_TEMPLATE.showUnitPrice);
    setShowExtras(DEFAULT_RECEIPT_TEMPLATE.showExtras);
    setShowNotes(DEFAULT_RECEIPT_TEMPLATE.showNotes);
    setShowPrintTime(DEFAULT_RECEIPT_TEMPLATE.showPrintTime);
    setLineToggles(Object.fromEntries(LINE_TOGGLE_KEYS.map((k) => [k, DEFAULT_RECEIPT_TEMPLATE[k]])) as LineToggles);
    setEnableLimit(false);
    setMaxPrints(3);
    setDefaultPaperWidth(DEFAULT_RECEIPT_TEMPLATE.defaultPaperWidth);
    setShowLogo(false);
    setLogoUrl('');
    setShowSocialMedia(false);
    setInstagram('');
    setFacebook('');
    setWebsite('');
    setShowQrCode(false);
    setQrCodeType('order_no');
    setQrCodeCustomUrl('');
    setShowBarcode(false);
  };

  const handlePrintSample = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const widthMm = paper === '58' ? '48mm' : paper === '76' ? '64mm' : '72mm';
    const fontSize = theme === 'large' ? '14px' : theme === 'medium' ? '12px' : '11px';

    const logoHtml = showLogo && logoUrl
      ? `<div style="text-align: center; margin-bottom: 8px;"><img src="${logoUrl}" style="max-height: 48px; max-width: 140px; object-fit: contain;" alt="Logo" /></div>`
      : '';

    const textContent = previewPieces.map((p) => {
      const alignStyle = p.align === 'center' ? 'text-align: center;' : 'text-align: left;';
      const boldStyle = p.bold ? 'font-weight: bold;' : '';
      return `<div style="${alignStyle} ${boldStyle}">${p.text}</div>`;
    }).join('');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Struk Contoh</title>
          <style>
            @page { margin: 0; }
            body {
              font-family: ui-monospace, 'Courier New', monospace;
              font-size: ${fontSize};
              line-height: 1.35;
              color: #000;
              background: #fff;
              margin: 0;
              padding: 8px;
              width: ${widthMm};
              box-sizing: border-box;
            }
          </style>
        </head>
        <body>
          ${logoHtml}
          ${textContent}
        </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 250);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const prob = receiptTemplateProblem(currentTemplate);
    if (prob) {
      setErr(prob);
      return;
    }

    setBusy(true);
    setErr(null);
    setOk(false);

    try {
      const cur = await data.getOutletSettings();
      await data.saveOutletOptions({
        ...cur.options,
        receiptHeader: receiptHeader.trim(),
        receiptFooter: receiptFooter.trim(),
        receiptShowCashier: currentTemplate.showCashier,
        receiptShowCustomer: currentTemplate.showCustomer,
        receiptTemplate: currentTemplate,
      });
      setOk(true);
      onSaved();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Gagal menyimpan pengaturan struk.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-24 min-w-0">
      {/* Notifikasi Status */}
      {err && (
        <p role="alert" className="cg-banner cg-banner--danger">
          {err}
        </p>
      )}
      {ok && (
        <p role="status" className="cg-banner cg-banner--info flex items-center gap-8">
          <Check className="w-16 h-16 text-accent" aria-hidden />
          <span>Pengaturan tampilan struk berhasil disimpan.</span>
        </p>
      )}

      {/* Baris Atas: Pilihan Tema & Tombol Reset */}
      <div className="bg-surface border border-border rounded-lg p-16 flex flex-col tablet:flex-row items-start tablet:items-center justify-between gap-16">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-text-muted block mb-4">
            Tema Huruf Struk
          </label>
          <div className="flex flex-wrap items-center gap-8">
            {PRINT_THEMES.map((th) => (
              <button
                key={th.id}
                type="button"
                className="cg-chip"
                aria-pressed={theme === th.id}
                onClick={() => setTheme(th.id)}
              >
                {th.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-[6px]">
            Menentukan kerapatan dan ukuran cetak huruf di printer thermal kasir (Normal 32/48 kolom, Besar huruf ganda).
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-text-muted block mb-4">
            Lebar Kertas Bawaan
          </label>
          <div className="flex flex-wrap items-center gap-8">
            {(['58', '76', '80'] as const).map((w) => (
              <button
                key={w}
                type="button"
                className="cg-chip"
                aria-pressed={defaultPaperWidth === w}
                onClick={() => setDefaultPaperWidth(w)}
              >
                {w} mm
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-[6px]">
            Dipakai kasir yang belum pernah memilih lebar kertas sendiri di perangkatnya; kasir tetap bisa mengganti manual saat cetak.
          </p>
        </div>

        <button
          type="button"
          className="cg-btn cg-btn--secondary flex items-center gap-[6px] text-xs whitespace-nowrap"
          onClick={handleResetDefaults}
        >
          <RotateCcw className="w-16 h-16" aria-hidden />
          <span>Kembalikan ke bawaan</span>
        </button>
      </div>

      {/* Grid Utama: Formulir Bertab di Kiri, Pratinjau di Kanan */}
      <div className="grid grid-cols-1 laptop:grid-cols-12 gap-24 items-start min-w-0">
        {/* Kolom Kiri: Formulir Bertab */}
        <div className="laptop:col-span-7 bg-surface border border-border rounded-lg p-20 space-y-20 min-w-0">
          {/* Navigasi Tab */}
          <div className="flex border-b border-border gap-4" role="tablist" aria-label="Bagian Struk">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'header'}
              className={`px-16 py-8 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'header'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
              onClick={() => setActiveTab('header')}
            >
              Header (Kepala)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'body'}
              className={`px-16 py-8 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'body'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
              onClick={() => setActiveTab('body')}
            >
              Body (Rincian)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'footer'}
              className={`px-16 py-8 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'footer'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
              onClick={() => setActiveTab('footer')}
            >
              Footer & Batasan
            </button>
          </div>

          {/* TAB 1: HEADER (Identitas & Transaksi) */}
          {activeTab === 'header' && (
            <div className="space-y-20 animate-fadeIn min-w-0" role="tabpanel">
              {/* Bagian Identitas Toko */}
              <div className="space-y-12">
                <h3 className="text-sm font-semibold flex items-center gap-[6px]">
                  <Store className="w-16 h-16 text-accent" aria-hidden />
                  <span>Identitas Toko di Kepala Struk</span>
                </h3>
                <div className="grid gap-8 pl-8">
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showOutletName}
                      onChange={(e) => setShowOutletName(e.target.checked)}
                    />
                    <span>Nama outlet ({info.name})</span>
                  </label>
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showAddress}
                      onChange={(e) => setShowAddress(e.target.checked)}
                    />
                    <span>Alamat outlet ({info.address || 'Belum diisi'})</span>
                  </label>
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showPhone}
                      onChange={(e) => setShowPhone(e.target.checked)}
                    />
                    <span>Nomor telepon ({info.phone || 'Belum diisi'})</span>
                  </label>
                  
                  {/* Pilihan Logo Toko */}
                  <div className="space-y-8 pt-[6px] border-t border-border/50">
                    <label className="flex items-center gap-8 text-sm cursor-pointer select-none font-medium">
                      <input
                        type="checkbox"
                        checked={showLogo}
                        onChange={(e) => setShowLogo(e.target.checked)}
                      />
                      <span>Tampilkan logo outlet di kepala struk</span>
                    </label>

                    {showLogo && (
                      <div className="pl-24 space-y-8 p-12 bg-surface-raised rounded-md border border-border">
                        <div className="flex flex-wrap items-center gap-12">
                          {logoUrl ? (
                            <img
                              src={logoUrl}
                              alt="Logo Outlet"
                              className="h-48 w-48 object-contain rounded border border-border bg-white p-[2px]"
                            />
                          ) : (
                            <div className="h-48 w-48 rounded border border-dashed border-border flex items-center justify-center text-text-muted">
                              <ImageIcon className="w-20 h-20" aria-hidden />
                            </div>
                          )}
                          <div className="space-y-4 grow">
                            <label className="cg-btn cg-btn--secondary cg-btn--sm inline-flex items-center gap-[6px] cursor-pointer">
                              <ImageIcon className="w-[14px] h-[14px]" aria-hidden />
                              <span>Pilih gambar logo</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  if (!file.type.startsWith('image/')) {
                                    setErr('File harus berupa gambar (JPG, PNG, atau WebP)');
                                    return;
                                  }
                                  if (file.size > 2_000_000) {
                                    setErr('Ukuran logo maksimal 2 MB');
                                    return;
                                  }
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    const res = ev.target?.result;
                                    if (typeof res === 'string') {
                                      setLogoUrl(res);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                            </label>
                            {logoUrl && (
                              <button
                                type="button"
                                className="cg-btn cg-btn--ghost cg-btn--sm text-danger ml-8"
                                onClick={() => setLogoUrl('')}
                              >
                                <Trash2 className="w-[14px] h-[14px]" aria-hidden />
                                <span>Hapus</span>
                              </button>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-text-muted block mb-[2px]" htmlFor="struk-logo-url">
                            Atau masukkan URL gambar logo:
                          </label>
                          <input
                            id="struk-logo-url"
                            type="url"
                            className="cg-input text-xs"
                            placeholder="https://example.com/logo.png"
                            value={logoUrl.startsWith('data:') ? '' : logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                          />
                          {logoUrl.startsWith('data:') && (
                            <p className="text-[11px] text-text-muted mt-[2px]">Gambar logo terpasang dari berkas lokal.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Teks Kepala Struk */}
              <div className="space-y-[6px] pt-12 border-t border-border">
                <label className="cg-label" htmlFor="struk-header">
                  Teks di atas struk
                </label>
                <textarea
                  id="struk-header"
                  className="cg-input"
                  rows={3}
                  maxLength={200}
                  value={receiptHeader}
                  onChange={(e) => setReceiptHeader(e.target.value)}
                  placeholder="Mis. Selamat datang di Coffee Ground&#10;WiFi: cg-guest / Pass: ngopi123"
                  aria-describedby="struk-header-help"
                />
                <p id="struk-header-help" className="text-xs text-text-muted">
                  Tampil di bawah nama dan kontak outlet. Maksimal 4 baris ({receiptHeader.length}/200 karakter).
                </p>
              </div>

              {/* Bagian Informasi Transaksi */}
              <div className="space-y-12 pt-12 border-t border-border">
                <h3 className="text-sm font-semibold flex items-center gap-[6px]">
                  <FileText className="w-16 h-16 text-accent" aria-hidden />
                  <span>Informasi Transaksi</span>
                </h3>
                <div className="grid gap-8 pl-8">
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showOrderNo}
                      onChange={(e) => setShowOrderNo(e.target.checked)}
                    />
                    <span>Nomor pesanan (OUT1/A/...)</span>
                  </label>
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showOrderType}
                      onChange={(e) => setShowOrderType(e.target.checked)}
                    />
                    <span>Jenis pesanan (Makan di tempat / Bawa pulang)</span>
                  </label>
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showTable}
                      onChange={(e) => setShowTable(e.target.checked)}
                    />
                    <span>Nomor meja / label pesanan</span>
                  </label>
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showGuests}
                      onChange={(e) => setShowGuests(e.target.checked)}
                    />
                    <span>Jumlah tamu</span>
                  </label>
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showTime}
                      onChange={(e) => setShowTime(e.target.checked)}
                    />
                    <span>Waktu transaksi</span>
                  </label>
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showCashier}
                      onChange={(e) => setShowCashier(e.target.checked)}
                    />
                    <span>Nama kasir</span>
                  </label>
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showCustomer}
                      onChange={(e) => setShowCustomer(e.target.checked)}
                    />
                    <span>Nama pelanggan</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BODY (Rincian Produk) */}
          {activeTab === 'body' && (
            <div className="space-y-20 animate-fadeIn min-w-0" role="tabpanel">
              <div className="space-y-12">
                <h3 className="text-sm font-semibold flex items-center gap-[6px]">
                  <Layers className="w-16 h-16 text-accent" aria-hidden />
                  <span>Rincian Produk & Pesanan</span>
                </h3>
                <div className="grid gap-8 pl-8">
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showUnitPrice}
                      onChange={(e) => setShowUnitPrice(e.target.checked)}
                    />
                    <span>Tampilkan rincian harga satuan (mis. 2 x Rp 22.000)</span>
                  </label>
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showExtras}
                      onChange={(e) => setShowExtras(e.target.checked)}
                    />
                    <span>Tampilkan ekstra, topping, dan varian</span>
                  </label>
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showNotes}
                      onChange={(e) => setShowNotes(e.target.checked)}
                    />
                    <span>Tampilkan catatan per item (mis. kurang manis)</span>
                  </label>

                  {/* Kode QR & Barcode */}
                  <div className="space-y-8 pt-8 border-t border-border/50">
                    <label className="flex items-center gap-8 text-sm cursor-pointer select-none font-medium">
                      <input
                        type="checkbox"
                        checked={showQrCode}
                        onChange={(e) => setShowQrCode(e.target.checked)}
                      />
                      <QrCode className="w-16 h-16 text-accent" aria-hidden />
                      <span>Cetak kode QR di struk</span>
                    </label>

                    {showQrCode && (
                      <div className="pl-24 space-y-12 p-12 bg-surface-raised rounded-md border border-border">
                        <div>
                          <label className="text-xs font-semibold text-text-muted block mb-4">
                            Tujuan Kode QR:
                          </label>
                          <div className="grid gap-[6px]">
                            {QR_CODE_TYPES.map((qt) => (
                              <label key={qt.id} className="flex items-start gap-8 text-xs cursor-pointer select-none">
                                <input
                                  type="radio"
                                  name="qrCodeType"
                                  value={qt.id}
                                  checked={qrCodeType === qt.id}
                                  onChange={() => setQrCodeType(qt.id)}
                                  className="mt-[1px]"
                                />
                                <div>
                                  <span className="font-semibold text-text">{qt.label}</span>
                                  <p className="text-text-muted">{qt.desc}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                        {qrCodeType === 'custom' && (
                          <div className="space-y-4">
                            <label className="cg-label text-xs" htmlFor="struk-qr-custom-url">
                              Tautan / URL Kustom:
                            </label>
                            <input
                              id="struk-qr-custom-url"
                              type="url"
                              className="cg-input text-xs"
                              placeholder="https://toko.id/promo atau https://survey.id"
                              value={qrCodeCustomUrl}
                              onChange={(e) => setQrCodeCustomUrl(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <label className="flex items-center gap-8 text-sm cursor-pointer select-none font-medium pt-4">
                      <input
                        type="checkbox"
                        checked={showBarcode}
                        onChange={(e) => setShowBarcode(e.target.checked)}
                      />
                      <span>Cetak barcode nomor pesanan</span>
                    </label>
                    <p className="text-xs text-text-muted pl-24">
                      Menampilkan barcode 1D nomor pesanan di bawah struk untuk dipindai oleh barcode scanner kasir.
                    </p>
                  </div>
                </div>
              </div>

              <LineToggleGroup value={lineToggles} onChange={setLineToggles} />

              {/* Catatan Ketentuan Tetap */}
              <div className="p-12 border border-border rounded-md bg-surface-raised flex items-start gap-12 text-xs text-text-muted">
                <Info className="w-16 h-16 text-accent shrink-0 mt-[2px]" aria-hidden />
                <p>
                  Subtotal, potongan diskon, dan TOTAL selalu dicetak. Baris lain di atas bisa disembunyikan; pengaturan ini dipakai oleh layar kasir dan cetak printer.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: FOOTER & BATASAN */}
          {activeTab === 'footer' && (
            <div className="space-y-20 animate-fadeIn min-w-0" role="tabpanel">
              {/* Catatan Kaki */}
              <div className="space-y-[6px]">
                <label className="cg-label" htmlFor="struk-footer">
                  Catatan kaki struk
                </label>
                <textarea
                  id="struk-footer"
                  className="cg-input"
                  rows={3}
                  maxLength={300}
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  placeholder="Mis. Terima kasih atas kunjungan Anda!&#10;Follow kami di Instagram: @coffeeground"
                  aria-describedby="struk-footer-help"
                />
                <p id="struk-footer-help" className="text-xs text-text-muted">
                  Tampil di akhir struk ({receiptFooter.length}/300 karakter).
                </p>
              </div>

              {/* Bagian Media Sosial */}
              <div className="space-y-8 pt-12 border-t border-border">
                <label className="flex items-center gap-8 text-sm cursor-pointer select-none font-medium">
                  <input
                    type="checkbox"
                    checked={showSocialMedia}
                    onChange={(e) => setShowSocialMedia(e.target.checked)}
                  />
                  <Share2 className="w-16 h-16 text-accent" aria-hidden />
                  <span>Tampilkan akun media sosial di kaki struk</span>
                </label>

                {showSocialMedia && (
                  <div className="pl-24 space-y-8 p-12 bg-surface-raised rounded-md border border-border">
                    <div className="grid grid-cols-1 tablet:grid-cols-3 gap-8">
                      <div>
                        <label className="cg-label text-xs" htmlFor="struk-ig">
                          Instagram
                        </label>
                        <input
                          id="struk-ig"
                          type="text"
                          className="cg-input text-xs"
                          placeholder="@nama_toko"
                          value={instagram}
                          onChange={(e) => setInstagram(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="cg-label text-xs" htmlFor="struk-fb">
                          Facebook
                        </label>
                        <input
                          id="struk-fb"
                          type="text"
                          className="cg-input text-xs"
                          placeholder="fb.com/nama_toko"
                          value={facebook}
                          onChange={(e) => setFacebook(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="cg-label text-xs" htmlFor="struk-web">
                          Website
                        </label>
                        <input
                          id="struk-web"
                          type="text"
                          className="cg-input text-xs"
                          placeholder="toko.id"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tampilkan Waktu Cetak */}
              <div className="pt-12 border-t border-border">
                <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showPrintTime}
                    onChange={(e) => setShowPrintTime(e.target.checked)}
                  />
                  <span>Tampilkan waktu cetak di kaki struk (mis. dicetak 11/11/2026 10:15)</span>
                </label>
              </div>

              {/* Batasan Cetak Ulang Struk */}
              <div className="space-y-12 pt-12 border-t border-border">
                <h3 className="text-sm font-semibold flex items-center gap-[6px]">
                  <ShieldAlert className="w-16 h-16 text-accent" aria-hidden />
                  <span>Batasan Cetak Ulang Struk</span>
                </h3>
                <div className="space-y-12 pl-8">
                  <label className="flex items-center gap-8 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enableLimit}
                      onChange={(e) => setEnableLimit(e.target.checked)}
                    />
                    <span>Batasi cetak ulang struk per transaksi</span>
                  </label>

                  {enableLimit && (
                    <div className="flex items-center gap-12 bg-surface-raised p-12 rounded-md border border-border">
                      <label htmlFor="max-prints-input" className="text-sm whitespace-nowrap">
                        Maksimal cetak:
                      </label>
                      <input
                        id="max-prints-input"
                        type="number"
                        min={1}
                        max={MAX_PRINTS_LIMIT}
                        value={maxPrints}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(MAX_PRINTS_LIMIT, parseInt(e.target.value, 10) || 1));
                          setMaxPrints(val);
                        }}
                        className="cg-input w-[80px] text-center cg-num"
                      />
                      <span className="text-sm text-text-muted">kali (1 sampai 10 kali)</span>
                    </div>
                  )}

                  <p className="text-xs text-text-muted">
                    Bila dinyalakan, kasir tidak dapat mencetak struk lebih dari batas ini untuk transaksi yang sama.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tombol Simpan */}
          <div className="pt-16 border-t border-border flex items-center justify-end gap-12">
            <button
              type="submit"
              disabled={busy}
              className="cg-btn cg-btn--primary flex items-center gap-8"
            >
              <Check className="w-16 h-16" aria-hidden />
              <span>{busy ? 'Menyimpan…' : 'Simpan Pengaturan Struk'}</span>
            </button>
          </div>
        </div>

        {/* Kolom Kanan: Pratinjau Struk Langsung (Kertas Thermal Monospace) */}
        <div className="laptop:col-span-5 bg-surface border border-border rounded-lg p-20 space-y-16 sticky top-24 min-w-0">
          <div className="flex items-center justify-between gap-8 pb-12 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold">Pratinjau Struk Langsung</h3>
              <p className="text-xs text-text-muted">Perubahan formulir langsung terlihat</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="cg-chip"
                aria-pressed={paper === '58'}
                onClick={() => setPaper('58')}
              >
                58 mm
              </button>
              <button
                type="button"
                className="cg-chip"
                aria-pressed={paper === '76'}
                onClick={() => setPaper('76')}
              >
                76 mm
              </button>
              <button
                type="button"
                className="cg-chip"
                aria-pressed={paper === '80'}
                onClick={() => setPaper('80')}
              >
                80 mm
              </button>
            </div>
          </div>

          {/* Kertas Struk Thermal */}
          <div className="bg-surface-raised p-16 rounded-md flex justify-center overflow-x-auto">
            <div
              className="bg-white text-black p-16 shadow-md rounded border border-border"
              style={{
                fontFamily: 'ui-monospace, "Courier New", monospace',
                fontSize: theme === 'large' ? 14 : theme === 'medium' ? 12 : 11,
                lineHeight: 1.35,
                width: paper === '58' ? '240px' : paper === '76' ? '290px' : '320px',
                maxWidth: '100%',
                boxSizing: 'border-box',
              }}
              data-testid="receipt-preview-paper"
            >
              {showLogo && logoUrl && (
                <div className="flex justify-center mb-8">
                  <img
                    src={logoUrl}
                    alt="Logo Toko"
                    className="max-h-48 max-w-[140px] object-contain"
                  />
                </div>
              )}
              {previewPieces
                .filter((p) => !(showLogo && logoUrl && p.text === '[ LOGO ]'))
                .map((p, idx) => {
                  const alignClass = p.align === 'center' ? 'text-center' : 'text-left';
                  const boldClass = p.bold ? 'font-bold' : '';
                  return (
                    <div
                      key={idx}
                      className={`${alignClass} ${boldClass} whitespace-pre`}
                    >
                      {p.text}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Tombol Cetak Contoh */}
          <div className="pt-8">
            <button
              type="button"
              className="cg-btn cg-btn--secondary w-full flex items-center justify-center gap-8 text-sm"
              onClick={handlePrintSample}
            >
              <Printer className="w-16 h-16" aria-hidden />
              <span>Cetak Contoh ({paper} mm)</span>
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
