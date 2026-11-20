'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/** Ekstra sudah menjadi Varian; alamat lama diteruskan. */
export default function EkstraPindah() {
  const router = useRouter();
  useEffect(() => { router.replace('/varian'); }, [router]);
  return <p>Ekstra kini bernama Varian. <Link href="/varian">Buka Varian</Link></p>;
}
