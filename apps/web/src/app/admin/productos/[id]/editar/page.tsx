'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm } from '@/components/admin/product-form';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fake_getProductById,
  fake_updateProduct,
  type UpdateProductInput
} from '@/lib/mock/services/fake-product-admin.service';
import { Product } from '@/types';
import { toast } from 'sonner';

interface EditProductPageProps {
  params: {
    id: string;
  };
}

export default function EditProductPage({ params }: EditProductPageProps) {
  const router = useRouter();
  const [product, setProduct] = React.useState<Product | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadProduct = async () => {
      setIsLoading(true);
      const response = await fake_getProductById(params.id);

      if (response.success && response.data) {
        setProduct(response.data);
      } else {
        toast.error('Producto no encontrado');
        router.push('/admin/productos');
      }

      setIsLoading(false);
    };

    loadProduct();
  }, [params.id, router]);

  const handleSubmit = async (data: UpdateProductInput) => {
    const response = await fake_updateProduct(params.id, data);

    if (response.success) {
      toast.success('Producto actualizado correctamente');
      router.push('/admin/productos');
    } else {
      toast.error(response.error?.message || 'Error al actualizar producto');
    }
  };

  const handleCancel = () => {
    router.push('/admin/productos');
  };

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
