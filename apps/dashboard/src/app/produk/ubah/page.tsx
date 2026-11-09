'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { ProductForm } from '@/components/product-form';

function Ubah() {
  const data = useData();
  const id = useSearchParams().get('id') ?? '';
  const prod = useAsync(() => (id ? data.getCatalogProduct(id) : Promise.resolve(null)), [data, id]);
  return (
    <>
      <PageHeader title="Ubah produk" subtitle={prod.status === 'ready' && prod.data ? prod.data.name : undefined} />
      {prod.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {prod.status === 'error' && <ErrorBox message={prod.message} onRetry={prod.reload} />}
      {prod.status === 'ready' && !prod.data && (
        <div className="cg-empty"><p><strong>Produk tidak ditemukan.</strong></p><Link href="/produk" className="cg-btn cg-btn--secondary">Kembali ke daftar produk</Link></div>
      )}
      {prod.status === 'ready' && prod.data && <ProductForm key={prod.data.id} initial={prod.data} />}
    </>
  );
}

export default function UbahProduk() {
  return <Suspense fallback={null}><Ubah /></Suspense>;
}
