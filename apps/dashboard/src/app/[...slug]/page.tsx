import { notFound } from 'next/navigation';
import { ALL_ITEMS, findByPath } from '@/lib/nav';
import { PageHeader } from '@/components/page';

export function generateStaticParams() {
  return ALL_ITEMS.filter((i) => !i.built && i.href !== '/').map((i) => ({ slug: i.href.slice(1).split('/') }));
}

export default async function Stub({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const item = findByPath('/' + slug.join('/'));
  if (!item) notFound();
  return (
    <>
      <PageHeader title={item.label} subtitle={`Layar ${item.screen} · direncanakan di tahap ${item.tier}`} />
      <div className="cg-empty">
        <p><strong>Layar ini belum dibangun.</strong></p>
        <p className="text-text-muted">Urutannya mengikuti architecture.md. Menunya sudah ada supaya kerangka navigasi final.</p>
      </div>
    </>
  );
}
