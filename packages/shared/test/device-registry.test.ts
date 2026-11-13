import { describe, expect, it } from 'vitest';
import { defaultDriver, defaultPaper, deviceEntryProblem, deviceFormTitle, driversFor, filterDevices, papersFor, parseDeviceList, type DeviceEntry } from '../src/device-registry';

const entry = (over: Partial<DeviceEntry> = {}): DeviceEntry => ({ id: 'd1', kind: 'cashier_printer', connection: 'bluetooth', deviceName: 'RPP02N', driver: 'Generik ESC/POS', paper: '58', addedAt: '2026-11-13T00:00:00Z', ...over });
const { id: _id, addedAt: _at, ...draft } = entry();

describe('daftar perangkat', () => {
  it('judul formulir', () => expect(deviceFormTitle('kitchen_printer', 'bluetooth')).toBe('Printer Dapur - Bluetooth'));
  it('kertas dan driver menurut jenis', () => {
    expect(papersFor('cashier_printer')).toEqual(['58', '76', '80', 'a4']);
    expect(papersFor('label_printer')).toEqual(['50x30', '40x30']);
    expect(driversFor('label_printer')).toHaveLength(1);
    expect(defaultPaper('barcode_scanner')).toBeUndefined();
    expect(defaultDriver('cashier_printer')).toBe('Generik ESC/POS');
  });
  it('validasi: koneksi belum didukung, belum memindai, driver dan kertas wajib untuk printer', () => {
    expect(deviceEntryProblem(draft)).toBeNull();
    expect(deviceEntryProblem({ ...draft, connection: 'lan' })).toMatch(/belum didukung/);
    expect(deviceEntryProblem({ ...draft, deviceName: ' ' })).toMatch(/pindai/);
    expect(deviceEntryProblem({ ...draft, driver: undefined })).toMatch(/driver/);
    expect(deviceEntryProblem({ ...draft, paper: '50x30' })).toMatch(/kertas/);
    expect(deviceEntryProblem({ kind: 'barcode_scanner', connection: 'bluetooth', deviceName: 'Scanner 1' })).toBeNull();
  });
  it('tidak menerima perangkat kembar', () => {
    expect(deviceEntryProblem(draft, [entry()])).toMatch(/sudah ada/);
    expect(deviceEntryProblem({ ...draft, kind: 'kitchen_printer' }, [entry()])).toBeNull();
  });
  it('cari dan baca ulang daftar tersimpan', () => {
    const list = [entry(), entry({ id: 'd2', kind: 'kitchen_printer', deviceName: 'Dapur-1' })];
    expect(filterDevices(list, 'dapur').map((d) => d.id)).toEqual(['d2']);
    expect(filterDevices(list, '').length).toBe(2);
    expect(parseDeviceList(JSON.stringify([...list, { id: 5 }, null]))).toHaveLength(2);
    expect(parseDeviceList('bukan json')).toEqual([]);
    expect(parseDeviceList(null)).toEqual([]);
  });
});
