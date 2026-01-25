'use client';

import { useAuthStore } from '@/stores/auth-store';
import { LoadingButton } from '@/components/ui/loading-button';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

/**
 * Placeholder para admin dashboard
 * TODO: Implementar en Tasks #9-11
 */
export default function AdminPage() {
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
      <div className="max-w-6xl mx-auto">
        <div className="bg-card rounded-lg shadow-lg p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">Admin Dashboard</h1>

          <div className="space-y-4">
            <div className="p-4 bg-primary/10 border border-primary rounded-lg">
              <p className="font-semibold text-primary">Acceso administrativo verificado</p>
              <p className="text-sm text-muted-foreground mt-1">
                Solo usuarios con rol admin/owner pueden ver esta página
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Usuario</p>
              <p className="text-lg font-medium">
                {user.first_name} {user.last_name}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="text-lg font-medium">{user.email}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Rol</p>
              <p className="text-lg font-medium capitalize">{user.role}</p>
            </div>

            <div className="pt-6 border-t">
              <p className="text-sm text-muted-foreground mb-4">
                El contenido del backoffice se implementará en las tareas #9, #10 y #11
              </p>
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
