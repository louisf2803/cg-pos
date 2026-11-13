import { useState } from 'react';
import { Bluetooth, Plus, Printer, Search, Trash2 } from 'lucide-react';
import {
  CONNECTIONS, CONNECTION_LABEL, DEVICE_KINDS, DEVICE_KIND_LABEL, PAPER_LABEL, SUPPORTED_CONNECTIONS, defaultDriver, defaultPaper, deviceEntryProblem, deviceFormTitle,
  driversFor, filterDevices, isPrinter, papersFor, testPageBytes, type DeviceConnection, type DeviceEntry, type DeviceKind, type PaperSize,
} from '@cgpos/shared';
import { useDeviceRegistry, deviceRegistry } from '../../lib/device-registry';
import { bluetoothSupported, printBytes, scanBluetoothName, usePrinter } from '../../lib/printer';
import { Modal } from '../../ui';

type Step = 1 | 2 | 3;

function AddDevice({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const existing = useDeviceRegistry();
  const [step, setStep] = useState<Step>(1);
  const [kind, setKind] = useState<DeviceKind | null>(null);
  const [conn, setConn] = useState<DeviceConnection | null>(null);
  const [found, setFound] = useState('');
  const [driver, setDriver] = useState('');
  const [paper, setPaper] = useState<PaperSize | ''>('');
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState('');
  const supported = bluetoothSupported();

  function pickKind(k: DeviceKind) { setKind(k); setDriver(defaultDriver(k) ?? ''); setPaper(defaultPaper(k) ?? ''); setFound(''); setErr(''); }
  async function scan() {
    setScanning(true); setErr('');
    try { setFound(await scanBluetoothName()); } catch (e) { setErr(e instanceof Error ? e.message : 'Pemindaian gagal.'); } finally { setScanning(false); }
  }
  function save() {
    if (!kind || !conn) return;
    const draft = { kind, connection: conn, deviceName: found, ...(isPrinter(kind) ? { driver, ...(paper ? { paper } : {}) } : {}) };
    const problem = deviceEntryProblem(draft, existing);
    if (problem) { setErr(problem); return; }
    deviceRegistry.add(draft);
    // printer kasir: ukuran kertas yang sama dipakai dialog struk (hanya 58 atau 80 mm yang dikenal struk)
    if (kind === 'cashier_printer' && (paper === '58' || paper === '80')) { try { localStorage.setItem('cgpos.paper', paper); } catch { /* boleh gagal */ } }
    onAdded();
  }

  const title = step === 1 ? 'Tambah perangkat: jenis' : step === 2 ? 'Tambah perangkat: koneksi' : kind && conn ? deviceFormTitle(kind, conn) : 'Tambah perangkat';
  return (
    <Modal title={title} labelledBy="adddev-title" onClose={onClose}>
      <div className="grid gap-12">
        {step === 1 && (
          <fieldset className="grid gap-8 border-0 p-0 m-0">
            <legend className="cg-label">Pilih jenis perangkat</legend>
            {DEVICE_KINDS.map((k) => (
              <label key={k} className="flex items-center gap-8 p-8 border border-border rounded cursor-pointer">
                <input type="radio" name="dev-kind" checked={kind === k} onChange={() => pickKind(k)} /> {DEVICE_KIND_LABEL[k]}
              </label>
            ))}
          </fieldset>
        )}
        {step === 2 && (
          <fieldset className="grid gap-8 border-0 p-0 m-0">
            <legend className="cg-label">Pilih jenis koneksi</legend>
            {CONNECTIONS.map((c) => {
              const ok = SUPPORTED_CONNECTIONS.includes(c);
              return (
                <label key={c} className={`flex items-center justify-between gap-8 p-8 border border-border rounded ${ok ? 'cursor-pointer' : 'opacity-60'}`}>
                  <span className="flex items-center gap-8"><input type="radio" name="dev-conn" disabled={!ok} checked={conn === c} onChange={() => { setConn(c); setErr(''); }} /> {CONNECTION_LABEL[c]}</span>
                  {!ok && <small className="text-text-muted">Belum didukung</small>}
                </label>
              );
            })}
          </fieldset>
        )}
        {step === 3 && kind && (
          <>
            <div className="flex items-center justify-between gap-8">
              <span className="text-text-muted text-sm">Pasangkan perangkat Bluetooth</span>
              <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => void scan()} disabled={scanning || !supported}>
                <Bluetooth className="cg-icon cg-icon--sm" aria-hidden /> {scanning ? 'Memindai…' : 'Pindai'}
              </button>
            </div>
            {isPrinter(kind) && (
              <>
                <div className="cg-field"><label className="cg-label" htmlFor="dev-driver">Tipe driver</label>
                  <select id="dev-driver" className="cg-input" value={driver} onChange={(e) => { setDriver(e.target.value); setErr(''); }}>{driversFor(kind).map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
                <div className="cg-field"><label className="cg-label" htmlFor="dev-paper">Tipe kertas</label>
                  <select id="dev-paper" className="cg-input" value={paper} onChange={(e) => { setPaper(e.target.value as PaperSize); setErr(''); }}>{papersFor(kind).map((p) => <option key={p} value={p}>{PAPER_LABEL[p]}</option>)}</select></div>
              </>
            )}
            <div aria-live="polite">
              <p className="cg-label">Pilih printer</p>
              {!supported ? <p className="cg-banner cg-banner--warning" role="status">Bluetooth belum aktif atau tidak didukung peramban ini. Pakai Chrome atau Edge di alamat HTTPS dan nyalakan Bluetooth.</p>
                : found ? <p className="p-8 border border-accent rounded">{found}</p>
                : <p className="text-text-muted text-sm">Belum ada perangkat dipilih. Ketuk Pindai, lalu pilih perangkat dari daftar peramban.</p>}
            </div>
          </>
        )}
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={step === 1 ? onClose : () => { setStep((step - 1) as Step); setErr(''); }}>{step === 1 ? 'Batal' : 'Kembali'}</button>
          {step < 3 && <button type="button" className="cg-btn cg-btn--primary" disabled={step === 1 ? !kind : !conn} onClick={() => setStep((step + 1) as Step)}>Lanjut</button>}
          {step === 3 && <button type="button" className="cg-btn cg-btn--primary" disabled={!found} onClick={save}>Simpan</button>}
        </div>
      </div>
    </Modal>
  );
}

export function DeviceListDialog({ outletName, onClose }: { outletName: string; onClose: () => void }) {
  const devices = useDeviceRegistry();
  const printer = usePrinter();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const shown = filterDevices(devices, q);

  async function testPrint(d: DeviceEntry) {
    setBusy(d.id); setMsg('');
    try { await printBytes(testPageBytes(d.paper === '80' ? '80' : '58', outletName)); setMsg(`Uji cetak terkirim ke ${d.deviceName}.`); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Uji cetak gagal.'); }
    finally { setBusy(null); }
  }

  return (
    <Modal title="Perangkat" labelledBy="devlist-title" onClose={onClose}>
      <div className="grid gap-12">
        <div className="flex flex-wrap gap-8">
          <label className="cg-search grow"><span className="cg-sr">Cari perangkat</span><span className="relative flex items-center"><Search className="cg-icon cg-icon--sm absolute" style={{ left: 8 }} aria-hidden /><input className="cg-input" style={{ paddingLeft: 32 }} type="search" placeholder="Cari perangkat" value={q} onChange={(e) => setQ(e.target.value)} /></span></label>
          <button type="button" className="cg-btn cg-btn--primary" onClick={() => { setMsg(''); setAdding(true); }}><Plus className="cg-icon" aria-hidden /> Tambah perangkat</button>
        </div>
        {msg && <p role="status" className="cg-banner cg-banner--info">{msg}</p>}
        {devices.length === 0 ? (
          <div className="cg-empty"><Printer className="cg-icon cg-icon--lg" aria-hidden /><p><strong>Perangkat tidak tersedia</strong></p><p className="text-text-muted">Ketuk Tambah perangkat untuk memasangkan printer atau pemindai.</p></div>
        ) : shown.length === 0 ? (
          <p className="text-text-muted">Tidak ada perangkat yang cocok.</p>
        ) : (
          <ul className="grid gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Daftar perangkat">
            {shown.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-8 p-8 border border-border rounded">
                <span className="min-w-0"><strong className="block truncate">{d.deviceName}</strong><span className="text-sm text-text-muted">{DEVICE_KIND_LABEL[d.kind]} · {CONNECTION_LABEL[d.connection]}{d.paper ? ` · ${PAPER_LABEL[d.paper]}` : ''}{d.kind === 'cashier_printer' && printer.status === 'connected' && printer.name === d.deviceName ? ' · tersambung' : ''}</span></span>
                <span className="flex gap-8">
                  {d.kind === 'cashier_printer' && <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" disabled={busy === d.id || printer.status !== 'connected'} title={printer.status === 'connected' ? undefined : 'Sambungkan printer dulu dari dialog struk'} onClick={() => void testPrint(d)}>Uji cetak</button>}
                  <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Hapus ${d.deviceName}`} onClick={() => deviceRegistry.remove(d.id)}><Trash2 className="cg-icon cg-icon--sm" aria-hidden /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--primary" onClick={onClose}>Selesai</button></div>
      </div>
      {adding && <AddDevice onClose={() => setAdding(false)} onAdded={() => { setAdding(false); setMsg('Perangkat ditambahkan.'); }} />}
    </Modal>
  );
}
