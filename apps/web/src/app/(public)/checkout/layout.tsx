import type { ReactNode } from 'react';
import Script from 'next/script';

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Script
        src="https://www.mercadopago.com/v2/security.js"
        strategy="afterInteractive"
        data-view="checkout"
      />
      {children}
    </>
  );
}
