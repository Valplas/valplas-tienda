import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Valplas | Distribuidora de Artículos Plásticos',
  description:
    'Distribuidora de artículos plásticos, productos de limpieza y electrodomésticos en Buenos Aires, Argentina.',
  keywords: ['plasticos', 'limpieza', 'electrodomesticos', 'distribuidora', 'buenos aires'],
  authors: [{ name: 'Valplas' }],
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: 'https://valplas.net',
    siteName: 'Valplas',
    title: 'Valplas | Distribuidora de Artículos Plásticos',
    description: 'Distribuidora de artículos plásticos, productos de limpieza y electrodomésticos.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Valplas'
      }
    ]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
