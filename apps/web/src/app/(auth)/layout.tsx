import type { ReactNode } from 'react';
import Link from 'next/link';
import { StoreLogo } from '@/components/layout/store-logo';
import { getStoreSettings } from '@/lib/services/settings.service';

export default async function AuthLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const settings = await getStoreSettings();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Simple header with logo */}
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Link href="/" className="flex items-center" aria-label="Ir al inicio">
            <StoreLogo settings={settings} />
          </Link>
        </div>
      </header>

      {/* Centered auth content */}
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">{children}</div>
      </main>

      {/* Simple footer */}
      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Valplas. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
