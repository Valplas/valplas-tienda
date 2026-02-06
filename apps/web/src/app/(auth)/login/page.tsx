'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { loginSchema, type LoginFormData } from '@/lib/validations/auth';
import { useAuthStore } from '@/stores/auth-store';

import { FormField } from '@/components/ui/form-field';
import { LoadingButton } from '@/components/ui/loading-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  const login = useAuthStore((state) => state.login);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: '',
      password: '',
      rememberMe: false
    }
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);

    try {
      await login({
        identifier: data.identifier,
        password: data.password
      });

      toast.success('Sesión iniciada correctamente');

      // Redirigir a la URL de retorno o a /cuenta
      const redirectTo = searchParams.get('redirect') || '/cuenta';
      router.push(redirectTo);
    } catch (error: any) {
      toast.error(error?.message || 'Error al iniciar sesión. Intentá de nuevo.');
      console.error('Login error:', error);
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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Iniciar Sesión</h1>
            <p className="text-sm text-muted-foreground mt-2">Ingresá a tu cuenta de Valplas</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Identifier (Email o Username) */}
            <FormField
              label="Email o Usuario"
              error={errors.identifier?.message}
              type="text"
              placeholder="tu@email.com o usuario"
              autoComplete="username"
              {...register('identifier')}
            />

            {/* Password */}
            <FormField
              label="Contraseña"
              error={errors.password?.message}
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              {...register('password')}
            />

            {/* Remember Me */}
            <div className="flex items-center space-x-2">
              <Checkbox id="rememberMe" {...register('rememberMe')} />
              <Label
                htmlFor="rememberMe"
                className="text-sm font-normal cursor-pointer select-none"
              >
                Recordarme
              </Label>
            </div>

            {/* Submit Button */}
            <LoadingButton
              type="submit"
              className="w-full"
              loading={isLoading}
              loadingText="Ingresando..."
            >
              Ingresar
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
          <div className="space-y-4 text-center text-sm">
            <p className="text-muted-foreground">
              ¿No tenés cuenta?{' '}
              <Link href="/registro" className="font-medium text-primary hover:underline">
                Registrate
              </Link>
            </p>

            {/* Demo Credentials */}
            <div className="mt-6 p-4 bg-muted rounded-md text-left">
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Credenciales de prueba:
              </p>
              <p className="text-xs text-muted-foreground">
                Email: <span className="font-mono">owner@valplas.net</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Contraseña: <span className="font-mono">Valplas123</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen flex items-center justify-center">Cargando...</div>}
    >
      <LoginForm />
    </Suspense>
  );
}
