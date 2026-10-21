import type { ReactNode } from 'react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { getStoreSettings } from '@/lib/services/settings.service';

export default async function PublicLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const settings = await getStoreSettings();

  return (
    <div className="flex min-h-screen flex-col">
      <Header settings={settings} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
