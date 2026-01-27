'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm } from '@/components/admin/product-form';
import { Card, CardContent } from '@/components/ui/card';
import {
  fake_createProduct,
  type CreateProductInput
} from '@/lib/mock/services/fake-product-admin.service';
import { toast } from 'sonner';

export default function NewProductPage() {
  const router = useRouter();

  const handleSubmit = async (data: CreateProductInput) => {
    const response = await fake_createProduct(data);

    if (response.success) {
      toast.success('Producto creado correctamente');
      router.push('/admin/productos');
    } else {
      toast.error(response.error?.message || 'Error al crear producto');
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
