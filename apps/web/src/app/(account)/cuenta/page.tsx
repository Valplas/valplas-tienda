'use client';

import { useAuthStore } from '@/stores/auth-store';
import { LoadingButton } from '@/components/ui/loading-button';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

/**
 * Placeholder para cuenta del cliente
 * TODO: Implementar en Task #8
 */
export default function CuentaPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await logout();
    toast.success('Sesión cerrada correctamente');
    router.push('/');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-card rounded-lg shadow-lg p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">Mi Cuenta</h1>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Nombre completo</p>
              <p className="text-lg font-medium">
                {user.first_name} {user.last_name}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="text-lg font-medium">{user.email}</p>
            </div>

            {user.username && (
              <div>
                <p className="text-sm text-muted-foreground">Usuario</p>
                <p className="text-lg font-medium">{user.username}</p>
              </div>
            )}

            {user.phone && (
              <div>
                <p className="text-sm text-muted-foreground">Teléfono</p>
                <p className="text-lg font-medium">{user.phone}</p>
              </div>
            )}

            <div>
              <p className="text-sm text-muted-foreground">Rol</p>
              <p className="text-lg font-medium capitalize">{user.role}</p>
            </div>

            <div className="pt-6 border-t">
              <LoadingButton onClick={handleLogout} variant="outline">
                Cerrar Sesión
              </LoadingButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
