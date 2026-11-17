import { useSyncExternalStore } from 'react';

/**
 * Printer thermal Bluetooth umum (BLE + ESC/POS) lewat Web Bluetooth.
 * Berjalan di Chrome/Edge pada Android, Windows, macOS, Linux dan ChromeOS (wajib HTTPS, sambungan dimulai oleh ketukan kasir).
 * iPhone/iPad (Safari) tidak mendukung; di sana pakai cetak lewat dialog peramban.
 */

interface BleChar {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse?: (v: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (v: BufferSource) => Promise<void>;
  writeValue: (v: BufferSource) => Promise<void>;
}
interface BleService { getCharacteristics: () => Promise<BleChar[]> }
interface BleServer { connected: boolean; connect: () => Promise<BleServer>; disconnect: () => void; getPrimaryServices: () => Promise<BleService[]> }
interface BleDevice extends EventTarget { id: string; name?: string; gatt?: BleServer }
interface BleApi {
  requestDevice: (o: { acceptAllDevices: true; optionalServices: string[] }) => Promise<BleDevice>;
  getDevices?: () => Promise<BleDevice[]>;
}

/** UUID layanan yang lazim dipakai printer thermal BLE murah (tanpa ini Chrome menolak akses layanannya). */
const SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb', '0000ae30-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '00001101-0000-1000-8000-00805f9b34fb',
];

/** Web Serial (Chrome/Edge di Windows, macOS, Linux, ChromeOS): printer Bluetooth KLASIK (SPP) yang sudah dipasangkan di sistem muncul sebagai port COM, begitu juga printer USB. */
interface SerialPortLike { open: (o: { baudRate: number }) => Promise<void>; close: () => Promise<void>; writable: WritableStream<Uint8Array> | null; getInfo?: () => { usbVendorId?: number; usbProductId?: number }; addEventListener?: (t: string, l: () => void) => void }
interface SerialApi { requestPort: () => Promise<SerialPortLike> }
const serialApi = (): SerialApi | undefined => (globalThis as unknown as { navigator?: { serial?: SerialApi } }).navigator?.serial;
export const serialSupported = () => !!serialApi();
let serialPort: SerialPortLike | null = null;

const bluetooth = (): BleApi | undefined => (globalThis as unknown as { navigator?: { bluetooth?: BleApi } }).navigator?.bluetooth;
export const bluetoothSupported = () => !!bluetooth();
/** Ada cara mengirim langsung ke printer (Bluetooth BLE atau port serial) */
export const directPrintSupported = () => !!bluetooth() || !!serialApi();

export type PrinterStatus = 'unsupported' | 'idle' | 'connecting' | 'connected' | 'error';
export interface PrinterState { status: PrinterStatus; name: string; error: string; openDrawer: boolean }

const KEY = 'cgpos.printer';
const readPrefs = (): { openDrawer: boolean; name: string } => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { openDrawer: !!v.openDrawer, name: typeof v.name === 'string' ? v.name : '' }; } catch { return { openDrawer: false, name: '' }; }
};
const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify({ openDrawer: state.openDrawer, name: state.name })); } catch { /* boleh gagal */ } };

let device: BleDevice | null = null;
let channel: BleChar | null = null;
let state: PrinterState = { status: directPrintSupported() ? 'idle' : 'unsupported', name: readPrefs().name, error: '', openDrawer: readPrefs().openDrawer };
const listeners = new Set<() => void>();
const set = (patch: Partial<PrinterState>) => { state = { ...state, ...patch }; for (const l of listeners) l(); };

export const printerStore = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => state,
};
export const usePrinter = () => useSyncExternalStore(printerStore.subscribe, printerStore.get, printerStore.get);

async function open(dev: BleDevice): Promise<void> {
  const server = await (dev.gatt!.connected ? Promise.resolve(dev.gatt!) : dev.gatt!.connect());
  let found: BleChar | null = null;
  for (const svc of await server.getPrimaryServices()) {
    for (const ch of await svc.getCharacteristics()) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) { found = ch; break; }
    }
    if (found) break;
  }
  if (!found) throw new Error('Printer ini tidak punya jalur tulis yang dikenali. Coba printer thermal ESC/POS lain.');
  channel = found;
}

function watch(dev: BleDevice) {
  dev.addEventListener('gattserverdisconnected', () => { channel = null; set({ status: 'idle' }); });
}

const friendly = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  if (/cancel|chosen|dismiss/i.test(m)) return 'Pemilihan printer dibatalkan.';
  if (/secure|https/i.test(m)) return 'Bluetooth hanya jalan di alamat HTTPS.';
  return m || 'Gagal menyambung ke printer.';
};

/** Pilih dan sambungkan printer (harus dipicu ketukan kasir). */
export async function connectPrinter(): Promise<void> {
  const api = bluetooth();
  if (!api) { set({ status: 'unsupported' }); return; }
  set({ status: 'connecting', error: '' });
  try {
    const dev = await api.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    device = dev; watch(dev);
    await open(dev);
    set({ status: 'connected', name: dev.name || 'Printer Bluetooth', error: '' }); savePrefs();
  } catch (e) {
    set({ status: channel ? 'connected' : 'error', error: friendly(e) });
  }
}

/** Pindai: tampilkan pemilih perangkat Bluetooth peramban dan kembalikan nama yang dipilih, tanpa mengubah printer kasir yang sedang tersambung. Harus dipicu ketukan. */
export async function scanBluetoothName(): Promise<string> {
  const api = bluetooth();
  if (!api) throw new Error('Bluetooth tidak tersedia di peramban ini. Pakai Chrome atau Edge di alamat HTTPS.');
  try {
    const dev = await api.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    return dev.name || 'Perangkat Bluetooth';
  } catch (e) { throw new Error(friendly(e)); }
}

/** Sambungkan printer lewat port serial: printer Bluetooth klasik yang sudah dipasangkan di Windows/macOS (muncul sebagai port COM) atau printer USB. Harus dipicu ketukan kasir. */
export async function connectSerialPrinter(baudRate = 9600): Promise<void> {
  const api = serialApi();
  if (!api) { set({ status: 'unsupported', error: 'Peramban ini tidak punya Web Serial. Pakai Chrome atau Edge di komputer.' }); return; }
  set({ status: 'connecting', error: '' });
  try {
    const port = await api.requestPort();
    await port.open({ baudRate });
    port.addEventListener?.('disconnect', () => { serialPort = null; set({ status: 'idle' }); });
    serialPort = port; channel = null;
    set({ status: 'connected', name: 'Printer (port serial)', error: '' });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    set({ status: serialPort ? 'connected' : 'error', error: /No port selected|cancel/i.test(m) ? 'Pemilihan port dibatalkan.' : /already open|busy/i.test(m) ? 'Port sedang dipakai program lain. Tutup program itu lalu coba lagi.' : m || 'Gagal membuka port printer.' });
  }
}

export function disconnectPrinter() {
  try { device?.gatt?.disconnect(); } catch { /* sudah putus */ }
  const p = serialPort; serialPort = null;
  if (p) void p.close().catch(() => undefined);
  channel = null; set({ status: 'idle', error: '' });
}

export function setOpenDrawer(v: boolean) { set({ openDrawer: v }); savePrefs(); }

/** Coba sambung ulang ke printer yang pernah diizinkan, tanpa dialog (bila peramban mengizinkan getDevices). */
export async function reconnectPrinter(): Promise<void> {
  const api = bluetooth();
  if (!api?.getDevices || channel || state.status === 'connecting') return;
  try {
    const known = await api.getDevices();
    const dev = known.find((d) => !state.name || d.name === state.name) ?? known[0];
    if (!dev) return;
    device = dev; watch(dev); set({ status: 'connecting' });
    await open(dev); set({ status: 'connected', name: dev.name || state.name });
  } catch { set({ status: 'idle' }); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Kirim byte ke printer; menyambung ulang bila koneksi terputus sejak terakhir dipakai. */
export async function printBytes(bytes: Uint8Array): Promise<void> {
  if (serialPort) {
    const w = serialPort.writable?.getWriter();
    if (!w) { serialPort = null; set({ status: 'error', error: 'Port printer tertutup. Sambungkan ulang.' }); throw new Error('Port printer tertutup. Sambungkan ulang.'); }
    try { await w.write(bytes); }
    catch (e) { serialPort = null; set({ status: 'error', error: 'Pengiriman ke port printer gagal. Sambungkan ulang.' }); throw new Error(e instanceof Error ? e.message : 'Pengiriman ke port printer gagal.'); }
    finally { w.releaseLock(); }
    return;
  }
  if (!bluetooth()) throw new Error('Peramban ini tidak mendukung Bluetooth langsung.');
  if (!device) throw new Error('Printer belum disambungkan.');
  if (!channel || !device.gatt?.connected) { set({ status: 'connecting' }); try { await open(device); set({ status: 'connected' }); } catch (e) { set({ status: 'error', error: friendly(e) }); throw new Error(friendly(e)); } }
  const ch = channel!;
  const withResponse = ch.properties.write;
  const size = withResponse ? 100 : 20;
  try {
    for (let i = 0; i < bytes.length; i += size) {
      const part = bytes.slice(i, i + size);
      if (withResponse) await (ch.writeValueWithResponse ? ch.writeValueWithResponse(part) : ch.writeValue(part));
      else { await (ch.writeValueWithoutResponse ? ch.writeValueWithoutResponse(part) : ch.writeValue(part)); await sleep(15); }
    }
  } catch (e) {
    channel = null; set({ status: 'error', error: 'Pengiriman ke printer gagal. Sambungkan ulang lalu coba lagi.' });
    throw new Error(e instanceof Error ? e.message : 'Pengiriman ke printer gagal.');
  }
}
