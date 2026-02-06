/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm } from '@/components/admin/product-form';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

// TODO: Import real product admin service when available
// For now, using placeholder
async function createProduct(data: any): Promise<any> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('access_token')}`
    },
    credentials: 'include',
    body: JSON.stringify(data)
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
