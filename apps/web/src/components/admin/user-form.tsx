'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserFormData,
  type UpdateUserFormData
} from '@/lib/validations/user-admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { UserRole } from '@/types';
import { RoleBadge } from './role-badge';

interface UserFormUser {
  email: string | null;
  username: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
}

interface UserFormProps {
  user?: UserFormUser;
  onSubmit: (data: CreateUserFormData | UpdateUserFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function UserForm({ user, onSubmit, onCancel, isLoading }: UserFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isEditing = !!user;

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue
  } = useForm<CreateUserFormData | UpdateUserFormData>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
    defaultValues: user
      ? {
          email: user.email ?? '',
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName ?? '',
          phone: user.phone ?? '',
          role: user.role,
          password: '',
          isActive: user.isActive
        }
      : {
          email: '',
          username: '',
          firstName: '',
          lastName: '',
          phone: '',
          role: UserRole.CUSTOMER,
          password: '',
          isActive: true
        }
  });

  const selectedRole = useWatch({ control, name: 'role' });
  const isActive = useWatch({ control, name: 'isActive' });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Owner Role Warning */}
      {selectedRole === UserRole.OWNER && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Estás por crear/asignar el rol de <strong>Dueño</strong>. Este rol tiene acceso total al
            sistema. Asegurate de que sea correcto.
          </AlertDescription>
        </Alert>
      )}

      {/* Email */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          {...register('email')}
          placeholder="usuario@ejemplo.com"
          disabled={isLoading}
        />
        {errors.email && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.email.message}</p>
        )}
      </div>

      {/* Username */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="username">Nombre de usuario</Label>
        <Input
          id="username"
          {...register('username')}
          placeholder="nombreusuario"
          disabled={isLoading}
        />
        {errors.username && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.username.message}</p>
        )}
        <p className="text-xs text-muted-foreground">Opcional. Solo letras, números y guion bajo</p>
      </div>

      {/* First Name & Last Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 relative pb-5">
          <Label htmlFor="firstName">
            Nombre <span className="text-red-500">*</span>
          </Label>
          <Input
            id="firstName"
            {...register('firstName')}
            placeholder="Juan"
            disabled={isLoading}
          />
          {errors.firstName && (
            <p className="text-sm text-red-500 absolute bottom-0">{errors.firstName.message}</p>
          )}
        </div>

        <div className="space-y-2 relative pb-5">
          <Label htmlFor="lastName">Apellido</Label>
          <Input id="lastName" {...register('lastName')} placeholder="Pérez" disabled={isLoading} />
          {errors.lastName && (
            <p className="text-sm text-red-500 absolute bottom-0">{errors.lastName.message}</p>
          )}
        </div>
      </div>

      {/* Phone */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="phone">
          Teléfono <span className="text-red-500">*</span>
        </Label>
        <Input
          id="phone"
          type="tel"
          {...register('phone')}
          placeholder="+5491122334455"
          disabled={isLoading}
        />
        {errors.phone && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.phone.message}</p>
        )}
        <p className="text-xs text-muted-foreground">Formato: +5491122334455 (E.164)</p>
      </div>

      {/* Role */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="role">
          Rol <span className="text-red-500">*</span>
        </Label>
        <Select
          value={selectedRole}
          onValueChange={(value) => setValue('role', value as UserRole)}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UserRole.OWNER}>
              <div className="flex items-center gap-2">
                <RoleBadge role={UserRole.OWNER} />
              </div>
            </SelectItem>
            <SelectItem value={UserRole.ADMIN}>
              <div className="flex items-center gap-2">
                <RoleBadge role={UserRole.ADMIN} />
              </div>
            </SelectItem>
            <SelectItem value={UserRole.DRIVER}>
              <div className="flex items-center gap-2">
                <RoleBadge role={UserRole.DRIVER} />
              </div>
            </SelectItem>
            <SelectItem value={UserRole.CUSTOMER}>
              <div className="flex items-center gap-2">
                <RoleBadge role={UserRole.CUSTOMER} />
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        {errors.role && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.role.message}</p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="password">
          Contraseña {!isEditing && <span className="text-red-500">*</span>}
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            {...register('password')}
            placeholder={isEditing ? '********' : 'Mínimo 8 caracteres'}
            disabled={isLoading}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-sm text-red-500 absolute bottom-0">{errors.password.message}</p>
        )}
        {isEditing && (
          <p className="text-xs text-muted-foreground">
            Dejá en blanco para mantener la contraseña actual
          </p>
        )}
      </div>

      {/* Is Active */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="isActive"
          checked={isActive}
          onCheckedChange={(checked) => setValue('isActive', !!checked)}
          disabled={isLoading}
        />
        <Label htmlFor="isActive" className="cursor-pointer font-normal">
          Usuario activo
        </Label>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear Usuario'}
        </Button>
      </div>
    </form>
  );
}
