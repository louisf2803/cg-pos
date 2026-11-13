// Daftar perangkat di aplikasi kasir (A148): printer dan pemindai yang dipasangkan ke perangkat ini. Disimpan di perangkat (bukan data bisnis).
// Keputusan Louis 13 Nov 2026: hanya koneksi Bluetooth yang dikerjakan; koneksi lain tampil "belum didukung".

export type DeviceKind = 'cashier_printer' | 'kitchen_printer' | 'label_printer' | 'address_printer' | 'server_printer' | 'central_printer' | 'barcode_scanner' | 'ecr';
export type DeviceConnection = 'bluetooth' | 'lan' | 'usb' | 'printer_server';
export type PaperSize = '58' | '76' | '80' | 'a4' | '50x30' | '40x30';

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  cashier_printer: 'Printer Kasir', kitchen_printer: 'Printer Dapur', label_printer: 'Printer Label', address_printer: 'Printer Alamat',
  server_printer: 'Printer Server', central_printer: 'Printer Terpusat', barcode_scanner: 'Pemindai Barcode', ecr: 'Mesin ECR',
};
export const DEVICE_KINDS = Object.keys(DEVICE_KIND_LABEL) as DeviceKind[];

export const CONNECTION_LABEL: Record<DeviceConnection, string> = { bluetooth: 'Bluetooth', lan: 'LAN / WiFi', usb: 'USB / Serial', printer_server: 'Printer Server' };
export const CONNECTIONS: DeviceConnection[] = ['bluetooth', 'lan', 'usb', 'printer_server'];
/** Hanya Bluetooth yang didukung saat ini. */
export const SUPPORTED_CONNECTIONS: DeviceConnection[] = ['bluetooth'];

export const PAPER_LABEL: Record<PaperSize, string> = { '58': '58 mm', '76': '76 mm', '80': '80 mm', a4: 'A4', '50x30': 'Label 50 x 30 mm', '40x30': 'Label 40 x 30 mm' };
export const DRIVERS = ['Generik ESC/POS', 'Generik ESC/POS (huruf besar)', 'Generik ESC/POS (hemat kertas)'] as const;
export const LABEL_DRIVERS = ['Printer label (TSPL)'] as const;

/** Jenis yang mencetak dan memakai tipe driver serta kertas. */
export const isPrinter = (k: DeviceKind) => k !== 'barcode_scanner' && k !== 'ecr';

export interface DeviceEntry {
  id: string; kind: DeviceKind; connection: DeviceConnection;
  /** nama perangkat Bluetooth yang dipilih saat memindai */
  deviceName: string;
  driver?: string; paper?: PaperSize;
  addedAt: string;
}

export function driversFor(kind: DeviceKind): readonly string[] { return kind === 'label_printer' ? LABEL_DRIVERS : DRIVERS; }
export function papersFor(kind: DeviceKind): PaperSize[] { return kind === 'label_printer' ? ['50x30', '40x30'] : ['58', '76', '80', 'a4']; }
export const defaultPaper = (kind: DeviceKind): PaperSize | undefined => (isPrinter(kind) ? papersFor(kind)[0] : undefined);
export const defaultDriver = (kind: DeviceKind): string | undefined => (isPrinter(kind) ? driversFor(kind)[0] : undefined);

/** Judul formulir langkah 3, mis. "Printer Kasir - Bluetooth". */
export const deviceFormTitle = (kind: DeviceKind, c: DeviceConnection) => `${DEVICE_KIND_LABEL[kind]} - ${CONNECTION_LABEL[c]}`;

export function deviceEntryProblem(d: Omit<DeviceEntry, 'id' | 'addedAt'>, existing: readonly DeviceEntry[] = []): string | null {
  if (!SUPPORTED_CONNECTIONS.includes(d.connection)) return `Koneksi ${CONNECTION_LABEL[d.connection]} belum didukung.`;
  if (!d.deviceName.trim()) return 'Pilih perangkat dari hasil pindai dulu.';
  if (isPrinter(d.kind)) {
    if (!d.driver || !driversFor(d.kind).includes(d.driver)) return 'Pilih tipe driver.';
    if (!d.paper || !papersFor(d.kind).includes(d.paper)) return 'Pilih tipe kertas.';
  }
  if (existing.some((e) => e.kind === d.kind && e.connection === d.connection && e.deviceName.trim().toLowerCase() === d.deviceName.trim().toLowerCase())) {
    return `${DEVICE_KIND_LABEL[d.kind]} dengan nama itu sudah ada di daftar.`;
  }
  return null;
}

export function filterDevices(list: readonly DeviceEntry[], q: string): DeviceEntry[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [...list];
  return list.filter((d) => `${DEVICE_KIND_LABEL[d.kind]} ${CONNECTION_LABEL[d.connection]} ${d.deviceName}`.toLowerCase().includes(needle));
}

/** Baca daftar dari teks JSON yang tersimpan; buang entri yang rusak. */
export function parseDeviceList(raw: string | null): DeviceEntry[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((d): d is DeviceEntry => !!d && typeof d.id === 'string' && DEVICE_KINDS.includes(d.kind) && CONNECTIONS.includes(d.connection) && typeof d.deviceName === 'string');
  } catch { return []; }
}
