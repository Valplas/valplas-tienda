'use client';

import * as React from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';
import { ProductForm } from '@/components/admin/product-form';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { get } from '@/lib/api';
import { normalizeProduct, updateProduct, type Product } from '@/lib/services/products.service';
import { parsePriceInput } from '@/lib/formatters';
import type { ProductFormData } from '@/lib/validations/product';

interface EditProductPageProps {
  params: Promise<{
    id: string;
  }>;
}

// Raw shape returned by GET /products/:id → data.product
interface RawProductShape {
  id: string;
  name: string;
  slug: string;
  description?: string;
  base_price: number; // pesos ARS
  is_active: boolean;
  categoryId?: string;
  brandId?: string;
  availableStock?: number;
  images?: Array<{ url: string; alt?: string }>;
  [key: string]: unknown;
}

export default function EditProductPage({ params: paramsPromise }: EditProductPageProps) {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });
  const { id } = use(paramsPromise);
  const router = useRouter();
  const [product, setProduct] = React.useState<Product | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadProduct = async () => {
      setIsLoading(true);
      try {
        const res = await get<{ product: RawProductShape }>(`/products/${id}`);
        if (!res.success || !res.data) {
          throw new Error('Producto no encontrado');
        }
        const normalized = normalizeProduct(res.data.product);
        setProduct(normalized);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Producto no encontrado';
        console.error('Error loading product:', error);
        toast.error(message);
        router.push('/admin/productos');
      } finally {
        setIsLoading(false);
      }
    };

    loadProduct();
  }, [id, router]);

  const handleSubmit = async (data: ProductFormData & { images?: string[] }) => {
    try {
      const price = parsePriceInput(String(data.base_price));
      await updateProduct(id, {
        name: data.name,
        description: data.description,
        basePrice: price,
        categoryId: data.category_id,
        brandId: data.brand_id || undefined,
        sku: data.sku?.toUpperCase(),
        stock: data.stock,
        weight: data.weight,
        width: data.width,
        length: data.length,
        height: data.height,
        origin: data.origin,
        isFeatured: data.is_featured,
        isActive: data.is_active
      });
      toast.success('Producto actualizado correctamente');
      router.push('/admin/productos');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Error al actualizar producto. Intentá de nuevo.';
      console.error('Error updating product:', error);
      toast.error(message);
    }
  };

  const handleCancel = () => {
    router.push('/admin/productos');
  };

  if (authLoading || !user) return null;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Card>
          <CardContent className="pt-6 space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!product) {
    return null;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Editar Producto</h1>
        <p className="text-muted-foreground mt-1">
          Modificá la información del producto: <strong>{product.name}</strong>
        </p>
      </div>

      {/* Form */}
      <Card>
        <CardContent className="pt-6">
          <ProductForm product={product} onSubmit={handleSubmit} onCancel={handleCancel} />
        </CardContent>
      </Card>
    </div>
  );
}
