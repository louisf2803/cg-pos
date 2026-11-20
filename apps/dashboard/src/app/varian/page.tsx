'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/page';
import { MasterTab } from './master-tab';
import { ProdukTab } from './produk-tab';

type Tab = 'master' | 'produk';

export default function Varian() {
  const [tab, setTab] = useState<Tab>('master');
  return (
    <div className="space-y-24 max-w-full">
      <PageHeader title="Varian" subtitle="Satu tempat untuk ukuran, suhu, gula, es batu, penyajian, dan pilihan lain. Buat varian di Master, lalu pasang di produk beserta resepnya." />
      <div className="cg-tabs" role="tablist" aria-label="Varian">
        {([['master', 'Master varian'], ['produk', 'Pasang di produk dan resep']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="cg-tab" onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'master' ? <MasterTab /> : <ProdukTab />}
    </div>
  );
}
