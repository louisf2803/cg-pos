import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { DataProvider } from '@/lib/data';
import { ShellProvider } from '@/components/shell-context';
import { Topbar } from '@/components/topbar';
import { Sidebar } from '@/components/sidebar';

export const metadata: Metadata = {
  title: { default: 'CG POS Dashboard', template: '%s · CG POS' },
  description: 'Dashboard pemilik CG POS',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="cg-dash bg-bg text-text min-h-screen flex flex-col">
        <DataProvider>
          <ShellProvider>
            <Topbar />
            <div className="flex flex-1 min-w-0 relative items-start">
              <Sidebar />
              <main id="isi" className="flex-1 min-w-0 p-16 desktop:p-24 overflow-x-hidden">
                {children}
              </main>
            </div>
          </ShellProvider>
        </DataProvider>
      </body>
    </html>
  );
}
