/**
 * Product Not Found Page
 */

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ProductNotFound() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
        <AlertCircle className="h-16 w-16 text-muted-foreground" />
        <h1 className="mt-6 text-3xl font-bold">Producto no encontrado</h1>
        <p className="mt-2 text-muted-foreground">
          El producto que buscás no existe o fue eliminado
        </p>
        <div className="mt-8 flex gap-4">
          <Button asChild>
            <Link href="/productos">Ver Catálogo</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Volver al Inicio</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
