/**
 * Account Layout
 * Layout para páginas protegidas de cuenta de usuario
 */

import React from 'react';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  // Cada página hija llama a useRequireAuth() individualmente,
  // consistente con el patrón del layout de admin.
  return <>{children}</>;
}
