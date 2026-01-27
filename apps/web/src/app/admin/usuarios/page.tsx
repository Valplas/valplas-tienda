'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
import { User, UserRole } from '@/types';
import {
  fake_getUsers,
  fake_createUser,
  fake_updateUser,
  fake_deleteUser
} from '@/lib/mock/services/fake-user-admin.service';
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

export default function UsuariosPage() {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Check if current user is owner
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role !== UserRole.OWNER) {
      toast.error('Solo el dueño puede gestionar usuarios');
      router.push('/admin');
    }
  }, [currentUser, router]);

  // Load users
  const loadUsers = useCallback(async () => {
    setLoading(true);
    const response = await fake_getUsers({
      role: roleFilter === 'all' ? undefined : roleFilter
    });
    if (response.success && response.data) {
      setUsers(response.data);
    }
    setLoading(false);
  }, [roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreate = () => {
    setSelectedUser(null);
    setSheetOpen(true);
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setSheetOpen(true);
  };

  const handleSubmit = async (data: CreateUserFormData | UpdateUserFormData) => {
    setSaving(true);

    try {
      if (selectedUser) {
        const response = await fake_updateUser(selectedUser.id, data as UpdateUserFormData);
        if (response.success) {
          toast.success('Usuario actualizado correctamente');
          await loadUsers();
          setSheetOpen(false);
        } else {
          toast.error(response.error?.message || 'Error al actualizar usuario');
        }
      } else {
        const response = await fake_createUser(data as CreateUserFormData);
        if (response.success) {
          toast.success('Usuario creado correctamente');
          await loadUsers();
          setSheetOpen(false);
        } else {
          toast.error(response.error?.message || 'Error al crear usuario');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(
    (user: User) => {
      // Prevent self-delete
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
    if (!userToDelete || !currentUser) return;

    const response = await fake_deleteUser(userToDelete.id, currentUser.id);
    if (response.success) {
      toast.success('Usuario eliminado correctamente');
      await loadUsers();
    } else {
      toast.error(response.error?.message || 'Error al eliminar usuario');
    }

    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const columns = useMemo<ColumnDef<User>[]>(
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

  // Don't render if not owner
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
        {/* Filter by role */}
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
        searchKey="email"
        searchPlaceholder="Buscar por email, nombre o teléfono..."
        isLoading={loading}
        getRowId={(row) => row.id}
        getRowName={(row) => `${row.first_name} ${row.last_name}`}
      />

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
