'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2, Loader2 } from 'lucide-react';
import { DataTable } from '@/components/admin/data-table';
import { RoleBadge } from '@/components/admin/role-badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { UserRole } from '@/types';
import {
  AdminUser,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser
} from '@/lib/services/users.service';
import { UserForm } from '@/components/admin/user-form';
import { CreateUserFormData, UpdateUserFormData } from '@/lib/validations/user-admin';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useAuthStore } from '@/stores/auth-store';
import { useRouter } from 'next/navigation';

const PAGE_SIZE = 50;

export default function UsuariosPage() {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Check if current user is owner
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role !== UserRole.OWNER) {
      toast.error('Solo el dueño puede gestionar usuarios');
      router.push('/admin');
    }
  }, [currentUser, router]);

  const loadUsers = useCallback(
    async (searchTerm: string) => {
      setLoading(true);
      setPage(1);
      setHasMore(true);
      try {
        const result = await getAdminUsers({
          page: 1,
          limit: PAGE_SIZE,
          role: roleFilter === 'all' ? undefined : roleFilter,
          search: searchTerm || undefined
        });
        if (!isMountedRef.current) return;
        setUsers(result.users);
        setHasMore(result.users.length === PAGE_SIZE);
      } catch {
        if (!isMountedRef.current) return;
        toast.error('Error al cargar usuarios');
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [roleFilter]
  );

  const loadMore = useCallback(
    async (nextPage: number) => {
      setIsLoadingMore(true);
      try {
        const result = await getAdminUsers({
          page: nextPage,
          limit: PAGE_SIZE,
          role: roleFilter === 'all' ? undefined : roleFilter,
          search: search || undefined
        });
        if (!isMountedRef.current) return;
        setUsers((prev) => [...prev, ...result.users]);
        setHasMore(result.users.length === PAGE_SIZE);
        setPage(nextPage);
      } catch {
        if (!isMountedRef.current) return;
        setHasMore(false);
        toast.error('Error al cargar más usuarios');
      } finally {
        if (isMountedRef.current) {
          setIsLoadingMore(false);
        }
      }
    },
    [roleFilter, search]
  );

  useEffect(() => {
    loadUsers(search);
  }, [loadUsers, search]);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
  }, []);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries[0].isIntersecting && hasMore && !isLoadingMore && !loading) {
          loadMore(page + 1);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [hasMore, isLoadingMore, loading, page, loadMore]);

  const handleCreate = () => {
    setSelectedUser(null);
    setSheetOpen(true);
  };

  const handleEdit = (user: AdminUser) => {
    setSelectedUser(user);
    setSheetOpen(true);
  };

  const handleSubmit = async (data: CreateUserFormData | UpdateUserFormData) => {
    setSaving(true);

    try {
      if (selectedUser) {
        const updateData: Parameters<typeof updateAdminUser>[1] = {
          email: data.email,
          username: data.username || undefined,
          first_name: data.first_name,
          last_name: data.last_name,
          role: data.role,
          phone: data.phone || undefined,
          is_active: data.is_active
        };
        await updateAdminUser(selectedUser.id, updateData);
        toast.success('Usuario actualizado correctamente');
        await loadUsers(search);
        setSheetOpen(false);
      } else {
        const createData = data as CreateUserFormData;
        await createAdminUser({
          email: createData.email,
          username: createData.username || createData.email.split('@')[0],
          first_name: createData.first_name,
          last_name: createData.last_name,
          password: createData.password,
          role: createData.role,
          phone: createData.phone || undefined,
          is_active: createData.is_active
        });
        toast.success('Usuario creado correctamente');
        await loadUsers(search);
        setSheetOpen(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar usuario';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(
    (user: AdminUser) => {
      if (currentUser && user.id === currentUser.id) {
        toast.error('No podés eliminar tu propia cuenta');
        return;
      }
      setUserToDelete(user);
      setDeleteDialogOpen(true);
    },
    [currentUser]
  );

  const confirmDelete = async () => {
    if (!userToDelete) return;

    try {
      await deleteAdminUser(userToDelete.id);
      toast.success('Usuario eliminado correctamente');
      await loadUsers(search);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar usuario';
      toast.error(message);
    }

    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const columns = useMemo<ColumnDef<AdminUser>[]>(
    () => [
      {
        id: 'avatar',
        header: '',
        cell: ({ row }) => {
          const initials =
            `${row.original.first_name[0]}${row.original.last_name[0]}`.toUpperCase();
          return (
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          );
        },
        enableSorting: false
      },
      {
        id: 'name',
        header: 'Nombre',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.first_name} {row.original.last_name}
            </div>
            <div className="text-sm text-muted-foreground">@{row.original.username}</div>
          </div>
        )
      },
      {
        accessorKey: 'email',
        header: 'Email'
      },
      {
        accessorKey: 'phone',
        header: 'Teléfono',
        cell: ({ row }) => row.original.phone || <span className="text-muted-foreground">—</span>
      },
      {
        accessorKey: 'role',
        header: 'Rol',
        cell: ({ row }) => <RoleBadge role={row.original.role} />
      },
      {
        accessorKey: 'is_active',
        header: 'Estado',
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant="default">Activo</Badge>
          ) : (
            <Badge variant="secondary">Inactivo</Badge>
          )
      },
      {
        accessorKey: 'created_at',
        header: 'Creado',
        cell: ({ row }) =>
          new Date(row.original.created_at).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const isCurrentUser = currentUser && row.original.id === currentUser.id;
          return (
            <div className="flex items-center gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleEdit(row.original)}
                className="h-8 w-8 p-0"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(row.original)}
                disabled={!!isCurrentUser}
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
        enableSorting: false
      }
    ],
    [currentUser, handleDelete]
  );

  if (!currentUser || currentUser.role !== UserRole.OWNER) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
        <p className="text-muted-foreground mt-2">
          Gestioná usuarios, roles y permisos del sistema
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Select
          value={roleFilter}
          onValueChange={(value) => setRoleFilter(value as UserRole | 'all')}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los roles</SelectItem>
            <SelectItem value={UserRole.OWNER}>Dueños</SelectItem>
            <SelectItem value={UserRole.ADMIN}>Administradores</SelectItem>
            <SelectItem value={UserRole.DRIVER}>Choferes</SelectItem>
            <SelectItem value={UserRole.CUSTOMER}>Clientes</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      <DataTable
        data={users}
        columns={columns}
        onSearch={handleSearch}
        searchPlaceholder="Buscar por nombre, email o teléfono..."
        isLoading={loading}
        getRowId={(row) => row.id}
        getRowName={(row) => `${row.first_name} ${row.last_name}`}
      />

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />
      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {!hasMore && users.length > 0 && (
        <p className="text-center text-sm text-muted-foreground py-2">
          {users.length} usuario(s) en total
        </p>
      )}

      {/* User Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selectedUser ? 'Editar Usuario' : 'Nuevo Usuario'}</SheetTitle>
            <SheetDescription>
              {selectedUser
                ? 'Actualizá los datos del usuario'
                : 'Creá un nuevo usuario en el sistema'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <UserForm
              user={selectedUser || undefined}
              onSubmit={handleSubmit}
              onCancel={() => setSheetOpen(false)}
              isLoading={saving}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que querés eliminar al usuario{' '}
              <strong>
                {userToDelete?.first_name} {userToDelete?.last_name}
              </strong>
              ? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
