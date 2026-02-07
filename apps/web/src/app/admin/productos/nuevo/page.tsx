/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm } from '@/components/admin/product-form';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

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
  return {
    name: data.name,
    sku: data.sku.toUpperCase(), // Backend requires uppercase
    slug: generateSlug(data.name), // Auto-generate from name
    description: data.description,
    categoryId: data.category_id,
    brandId: data.brand_id,
    basePrice: data.base_price,
    stock: data.stock,
    isFeatured: data.is_featured,
    unit: data.unit
  };
}

async function createProduct(data: any): Promise<any> {
  const backendData = mapToBackendFormat(data);

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('access_token')}`
    },
    credentials: 'include',
    body: JSON.stringify(backendData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Error al crear producto');
  }

  return response.json();
}

export default function NewProductPage() {
  const router = useRouter();

  const handleSubmit = async (data: any) => {
    try {
      await createProduct(data);
      toast.success('Producto creado correctamente');
      router.push('/admin/productos');
    } catch (error: any) {
      console.error('Error creating product:', error);
      toast.error(error?.message || 'Error al crear producto. Intentá de nuevo.');
    }
  };

  const handleCancel = () => {
    router.push('/admin/productos');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Nuevo Producto</h1>
        <p className="text-muted-foreground mt-1">Creá un nuevo producto para tu catálogo</p>
      </div>

      {/* Form */}
      <Card>
        <CardContent className="pt-6">
          <ProductForm onSubmit={handleSubmit} onCancel={handleCancel} />
        </CardContent>
      </Card>
    </div>
  );
}
