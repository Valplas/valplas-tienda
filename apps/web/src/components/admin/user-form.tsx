'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { User, UserRole } from '@/types';
import { RoleBadge } from './role-badge';

interface UserFormProps {
  user?: User;
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
    watch,
    setValue
  } = useForm<CreateUserFormData | UpdateUserFormData>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
    defaultValues: user
      ? {
          email: user.email,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          role: user.role,
          password: '',
          is_active: user.is_active
        }
      : {
          email: '',
          username: '',
          first_name: '',
          last_name: '',
          phone: '',
          role: UserRole.CUSTOMER,
          password: '',
          is_active: true
        }
  });

  const selectedRole = watch('role');
  const isActive = watch('is_active');

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
        <Label htmlFor="email">
          Email <span className="text-red-500">*</span>
        </Label>
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
          <Label htmlFor="first_name">
            Nombre <span className="text-red-500">*</span>
          </Label>
          <Input
            id="first_name"
            {...register('first_name')}
            placeholder="Juan"
            disabled={isLoading}
          />
          {errors.first_name && (
            <p className="text-sm text-red-500 absolute bottom-0">{errors.first_name.message}</p>
          )}
        </div>

        <div className="space-y-2 relative pb-5">
          <Label htmlFor="last_name">
            Apellido <span className="text-red-500">*</span>
          </Label>
          <Input
            id="last_name"
            {...register('last_name')}
            placeholder="Pérez"
            disabled={isLoading}
          />
          {errors.last_name && (
            <p className="text-sm text-red-500 absolute bottom-0">{errors.last_name.message}</p>
          )}
        </div>
      </div>

      {/* Phone */}
      <div className="space-y-2 relative pb-5">
        <Label htmlFor="phone">Teléfono</Label>
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
          id="is_active"
          checked={isActive}
          onCheckedChange={(checked) => setValue('is_active', !!checked)}
          disabled={isLoading}
        />
        <Label htmlFor="is_active" className="cursor-pointer font-normal">
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
