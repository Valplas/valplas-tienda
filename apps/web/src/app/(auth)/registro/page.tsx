'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { registerSchema, type RegisterFormData } from '@/lib/validations/auth';
import { useAuthStore } from '@/stores/auth-store';

import { FormField } from '@/components/ui/form-field';
import { LoadingButton } from '@/components/ui/loading-button';

export default function RegistroPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const register_action = useAuthStore((state) => state.register);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      username: '',
      first_name: '',
      last_name: '',
      phone: '',
      password: '',
      confirmPassword: ''
    }
  });

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);

    try {
      const response = await register_action({
        email: data.email,
        username: data.username || '',
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone || '',
        password: data.password
      });

      if (response.success) {
        toast.success('Cuenta creada exitosamente');
        // Auto-login y redirigir a cuenta
        router.push('/cuenta');
      } else {
        toast.error(response.error?.message || 'Error al crear la cuenta');
      }
    } catch (error) {
      toast.error('Error al crear la cuenta. Intentá de nuevo.');
      console.error('Register error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-muted/30">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg shadow-lg p-6 sm:p-8">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Crear Cuenta</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Registrate para comenzar a comprar en Valplas
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <FormField
              label="Email"
              error={errors.email?.message}
              type="email"
              placeholder="tu@email.com"
              autoComplete="email"
              required
              {...register('email')}
            />

            {/* Username (opcional) */}
            <FormField
              label="Usuario"
              error={errors.username?.message}
              type="text"
              placeholder="usuario123"
              autoComplete="username"
              helperText="Opcional - Solo letras, números y guion bajo"
              {...register('username')}
            />

            {/* Nombre */}
            <FormField
              label="Nombre"
              error={errors.first_name?.message}
              type="text"
              placeholder="Juan"
              autoComplete="given-name"
              required
              {...register('first_name')}
            />

            {/* Apellido */}
            <FormField
              label="Apellido"
              error={errors.last_name?.message}
              type="text"
              placeholder="Pérez"
              autoComplete="family-name"
              required
              {...register('last_name')}
            />

            {/* Teléfono (opcional) */}
            <FormField
              label="Teléfono"
              error={errors.phone?.message}
              type="tel"
              placeholder="+5491122334455"
              autoComplete="tel"
              helperText="Opcional - Formato: +5491122334455"
              {...register('phone')}
            />

            {/* Password */}
            <FormField
              label="Contraseña"
              error={errors.password?.message}
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              helperText="Mínimo 8 caracteres, una mayúscula y un número"
              required
              {...register('password')}
            />

            {/* Confirm Password */}
            <FormField
              label="Confirmar Contraseña"
              error={errors.confirmPassword?.message}
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              required
              {...register('confirmPassword')}
            />

            {/* Submit Button */}
            <LoadingButton
              type="submit"
              className="w-full"
              loading={isLoading}
              loadingText="Creando cuenta..."
            >
              Crear Cuenta
            </LoadingButton>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">o</span>
            </div>
          </div>

          {/* Footer Links */}
          <div className="text-center text-sm">
            <p className="text-muted-foreground">
              ¿Ya tenés cuenta?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Iniciar Sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
