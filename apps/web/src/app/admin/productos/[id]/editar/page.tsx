/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm } from '@/components/admin/product-form';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface EditProductPageProps {
  params: {
    id: string;
  };
}

/**
 * Generate slug from product name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Map frontend data (snake_case) to backend format (camelCase)
 */
function mapToBackendFormat(data: any): any {
  const mapped: any = {};

  if (data.name !== undefined) {
    mapped.name = data.name;
    mapped.slug = generateSlug(data.name); // Auto-generate from name
  }
  if (data.sku !== undefined) mapped.sku = data.sku.toUpperCase();
  if (data.description !== undefined) mapped.description = data.description;
  if (data.category_id !== undefined) mapped.categoryId = data.category_id;
  if (data.brand_id !== undefined) mapped.brandId = data.brand_id;
  if (data.base_price !== undefined) mapped.basePrice = data.base_price;
  if (data.stock !== undefined) mapped.stock = data.stock;
  if (data.is_featured !== undefined) mapped.isFeatured = data.is_featured;
  if (data.is_active !== undefined) mapped.isActive = data.is_active;
  if (data.unit !== undefined) mapped.unit = data.unit;

  return mapped;
}

async function getProduct(id: string): Promise<any> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products/${id}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('access_token')}`
    },
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Error al cargar producto');
  }

  const result = await response.json();
  return result.data;
}

async function updateProduct(id: string, data: any): Promise<any> {
  const backendData = mapToBackendFormat(data);

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('access_token')}`
    },
    credentials: 'include',
    body: JSON.stringify(backendData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Error al actualizar producto');
  }

  return response.json();
}

export default function EditProductPage({ params }: EditProductPageProps) {
  const router = useRouter();
  const [product, setProduct] = React.useState<any | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadProduct = async () => {
      setIsLoading(true);
      try {
        const data = await getProduct(params.id);
        setProduct(data);
      } catch (error: any) {
        console.error('Error loading product:', error);
        toast.error(error?.message || 'Producto no encontrado');
        router.push('/admin/productos');
      } finally {
        setIsLoading(false);
      }
    };

    loadProduct();
  }, [params.id, router]);

  const handleSubmit = async (data: any) => {
    try {
      await updateProduct(params.id, data);
      toast.success('Producto actualizado correctamente');
      router.push('/admin/productos');
    } catch (error: any) {
      console.error('Error updating product:', error);
      toast.error(error?.message || 'Error al actualizar producto. Intentá de nuevo.');
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
