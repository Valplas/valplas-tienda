import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-primary sm:text-6xl">Valplas</h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          Distribuidora de Artículos Plásticos, Productos de Limpieza y Electrodomésticos
        </p>
        <p className="mt-4 text-sm text-muted-foreground">Sitio en construcción</p>

        <div className="mt-8 flex gap-4 justify-center">
          <Button asChild>
            <Link href="/login">Iniciar Sesión</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/registro">Registrarse</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/cuenta">Mi Cuenta</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/admin">Admin</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
