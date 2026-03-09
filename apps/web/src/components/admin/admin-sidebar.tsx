'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { UserRole } from '@/types';
import {
  LayoutDashboard,
  Package,
  FolderTree,
  Tag,
  ShoppingCart,
  Truck,
  Users,
  ChevronLeft,
  ChevronRight,
  Percent
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[]; // Only visible for these roles
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard
  },
  {
    title: 'Productos',
    href: '/admin/productos',
    icon: Package
  },
  {
    title: 'Categorías',
    href: '/admin/categorias',
    icon: FolderTree
  },
  {
    title: 'Marcas',
    href: '/admin/marcas',
    icon: Tag
  },
  {
    title: 'Listas de Precio',
    href: '/admin/listas-de-precio',
    icon: Percent,
    roles: [UserRole.ADMIN, UserRole.OWNER]
  },
  {
    title: 'Pedidos',
    href: '/admin/pedidos',
    icon: ShoppingCart
  },
  {
    title: 'Envíos',
    href: '/admin/envios',
    icon: Truck
  },
  {
    title: 'Usuarios',
    href: '/admin/usuarios',
    icon: Users,
    roles: [UserRole.OWNER] // Only visible for owner
  }
];

interface AdminSidebarContentProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onMobileLinkClick?: () => void;
}

function AdminSidebarContent({
  collapsed = false,
  onCollapsedChange,
  onMobileLinkClick
}: AdminSidebarContentProps) {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return user && item.roles.includes(user.role);
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className={cn(
          'flex h-16 items-center border-b px-4',
          collapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary-600" />
            <span className="text-lg font-semibold">Admin</span>
          </div>
        )}
        {onCollapsedChange && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCollapsedChange(!collapsed)}
            className={cn('hidden lg:flex', collapsed && 'mx-auto')}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileLinkClick}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  isActive &&
                    'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-100',
                  !isActive && 'text-muted-foreground',
                  collapsed && 'justify-center'
                )}
              >
                <Icon className={cn('h-5 w-5 flex-shrink-0', collapsed && 'h-6 w-6')} />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
}

interface AdminSidebarProps {
  className?: string;
}

export function AdminSidebar({ className }: AdminSidebarProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex lg:flex-col border-r bg-background transition-all duration-300',
          collapsed ? 'w-16' : 'w-64',
          className
        )}
      >
        <AdminSidebarContent collapsed={collapsed} onCollapsedChange={setCollapsed} />
      </aside>
    </>
  );
}

interface AdminSidebarMobileProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminSidebarMobile({ open, onOpenChange }: AdminSidebarMobileProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
        <AdminSidebarContent onMobileLinkClick={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
