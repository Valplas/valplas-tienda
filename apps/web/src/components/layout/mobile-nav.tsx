'use client';

/**
 * MobileNav Component
 * Mobile navigation drawer with hamburger menu
 */

import { Home, Package, Phone, User, LayoutDashboard, LogOut } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/stores/auth-store';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserRole } from '@/types';
import { toast } from 'sonner';

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.OWNER;

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Sesión cerrada correctamente');
      onOpenChange(false);
      router.push('/');
    } catch (error) {
      console.error('Error logging out:', error);
      toast.error('Error al cerrar sesión');
    }
  };

  const handleNavigation = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(20rem,85vw)] p-0">
        <SheetHeader className="border-b p-6">
          <SheetTitle>Menú</SheetTitle>
          <SheetDescription className="sr-only">Navegación principal</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-1 p-4">
          {/* Main Navigation */}
          <Button variant="ghost" className="justify-start" onClick={() => handleNavigation('/')}>
            <Home className="mr-2 h-5 w-5" />
            Inicio
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() => handleNavigation('/productos')}
          >
            <Package className="mr-2 h-5 w-5" />
            Productos
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() => handleNavigation('/contacto')}
          >
            <Phone className="mr-2 h-5 w-5" />
            Contacto
          </Button>

          {/* Authenticated User Section */}
          {isAuthenticated && user ? (
            <>
              <Separator className="my-4" />
              <div className="mb-2 px-3">
                <p className="text-sm font-medium">
                  {user.firstName ? `${user.firstName} ${user.lastName}` : user.username}
                </p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>

              {isAdmin ? (
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => handleNavigation('/admin')}
                >
                  <LayoutDashboard className="mr-2 h-5 w-5" />
                  Panel Admin
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => handleNavigation('/cuenta')}
                >
                  <User className="mr-2 h-5 w-5" />
                  Mi Cuenta
                </Button>
              )}

              <Separator className="my-4" />
              <Button
                variant="ghost"
                className="justify-start text-destructive hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-5 w-5" />
                Cerrar Sesión
              </Button>
            </>
          ) : (
            <>
              <Separator className="my-4" />
              <Button asChild className="w-full">
                <Link href="/login" onClick={() => onOpenChange(false)}>
                  Ingresar
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/registro" onClick={() => onOpenChange(false)}>
                  Crear Cuenta
                </Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
