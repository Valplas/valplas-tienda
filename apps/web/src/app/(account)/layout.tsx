import type { ReactNode } from 'react';
import { AccountShell } from '@/components/layout/account-shell';
import { getStoreSettings } from '@/lib/services/settings.service';

export default async function AccountLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const settings = await getStoreSettings();

  return <AccountShell settings={settings}>{children}</AccountShell>;
}
