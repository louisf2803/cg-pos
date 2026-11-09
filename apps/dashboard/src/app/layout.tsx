import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { DataProvider } from '@/lib/data';
import { Sidebar } from '@/components/sidebar';

export const metadata: Metadata = { title: { default: 'CG POS Dashboard', template: '%s · CG POS' }, description: 'Dashboard pemilik CG POS' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="cg-dash">
        <DataProvider>
          <div className="flex flex-col desktop:flex-row min-h-screen">
            <Sidebar />
            <main id="isi" className="flex-1 min-w-0 p-16 desktop:p-32">{children}</main>
          </div>
        </DataProvider>
      </body>
    </html>
  );
}
