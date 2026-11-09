'use client';
import { PageHeader } from '@/components/page';
import { ProductForm } from '@/components/product-form';

export default function TambahProduk() {
  return (
    <>
      <PageHeader title="Tambah produk" subtitle="Satu produk bisa punya beberapa varian, misalnya ukuran S, M, dan L" />
      <ProductForm />
    </>
  );
}
