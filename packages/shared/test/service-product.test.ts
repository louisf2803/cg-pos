import { describe, expect, it } from 'vitest';
import { createFakeData } from '../src/fake';

describe('A121: Produk Layanan (Jasa) - Durasi dan Staf', () => {
  it('menyimpan dan mengambil produk jasa tunggal dengan durasi dan staf', async () => {
    const data = createFakeData();
    const employees = await data.listEmployees();
    const staffIds = employees.slice(0, 2).map((e) => e.id);

    const saved = await data.saveCatalogProduct({
      name: 'Potong Rambut Pria',
      categoryId: null,
      kind: 'service',
      price: 50000,
      trackStock: false,
      serviceDurationMin: 45,
      serviceStaffIds: staffIds,
      variants: [],
    });

    expect(saved.kind).toBe('service');
    expect(saved.serviceDurationMin).toBe(45);
    expect(saved.serviceStaffIds).toEqual(staffIds);

    const fetched = await data.getCatalogProduct(saved.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.serviceDurationMin).toBe(45);
    expect(fetched?.serviceStaffIds).toEqual(staffIds);

    const catalog = await data.listCatalog();
    const item = catalog.find((c) => c.id === saved.id);
    expect(item?.serviceDurationMin).toBe(45);
    expect(item?.serviceStaffIds).toEqual(staffIds);
  });

  it('menyimpan dan mengambil produk jasa bervarian dengan durasi dan staf', async () => {
    const data = createFakeData();
    const employees = await data.listEmployees();
    const staffIds = employees.slice(0, 1).map((e) => e.id);

    const saved = await data.saveCatalogProduct({
      name: 'Pijat Refleksi',
      categoryId: null,
      kind: 'service',
      price: 0,
      trackStock: false,
      serviceDurationMin: 60,
      serviceStaffIds: staffIds,
      variants: [
        { label: 'Standar', price: 80000 },
        { label: 'Premium', price: 120000 },
      ],
    });

    expect(saved.kind).toBe('service');
    expect(saved.serviceDurationMin).toBe(60);
    expect(saved.serviceStaffIds).toEqual(staffIds);
    expect(saved.variants.length).toBe(2);

    const fetched = await data.getCatalogProduct(saved.id);
    expect(fetched?.serviceDurationMin).toBe(60);
    expect(fetched?.serviceStaffIds).toEqual(staffIds);
  });
});
