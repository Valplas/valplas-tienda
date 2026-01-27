'use client';

/**
 * AccountSidebar Component
 * Sidebar for customer account area
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { User, Package, MapPin, CreditCard, Settings, Heart, type LucideIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  {
    title: 'Mi Cuenta',
    href: '/cuenta',
    icon: User
  },
  {
    title: 'Mis Pedidos',
    href: '/cuenta/pedidos',
    icon: Package
  },
  {
    title: 'Direcciones',
    href: '/cuenta/direcciones',
    icon: MapPin
  },
  {
    title: 'Métodos de Pago',
    href: '/cuenta/pagos',
    icon: CreditCard
  },
  {
    title: 'Favoritos',
    href: '/cuenta/favoritos',
    icon: Heart
  },
  {
    title: 'Configuración',
    href: '/cuenta/configuracion',
    icon: Settings
  }
];

interface AccountSidebarProps {
  className?: string;
}

export function AccountSidebar({ className }: AccountSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={cn('w-64 border-r bg-background', className)}>
      {/* Header */}
      <div className="flex h-16 items-center border-b px-4">
        <span className="text-lg font-semibold">Mi Cuenta</span>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
                  isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
