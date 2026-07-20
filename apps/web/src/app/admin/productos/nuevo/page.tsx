'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';
import { ProductForm } from '@/components/admin/product-form';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { createProduct } from '@/lib/services/products.service';
import { parsePriceInput } from '@/lib/formatters';
import type { ProductFormData } from '@/lib/validations/product';

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

export default function NewProductPage() {
  const { user, isLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });
  const router = useRouter();

  const handleSubmit = async (data: ProductFormData & { images?: string[] }) => {
    try {
      const price = parsePriceInput(String(data.basePrice));
      await createProduct({
        name: data.name,
        slug: generateSlug(data.name),
        description: data.description,
        basePrice: price,
        costPrice: data.costPrice !== undefined ? parsePriceInput(String(data.costPrice)) : 0,
        categoryId: data.categoryId,
        brandId: data.brandId || undefined,
        sku: data.sku?.toUpperCase() || generateSlug(data.name).toUpperCase(),
        stock: data.stock,
        weight: data.weight,
        width: data.width,
        length: data.length,
        height: data.height,
        origin: data.origin,
        isFeatured: data.isFeatured,
        isActive: data.isActive ?? true
      });
      toast.success('Producto creado correctamente');
      router.push('/admin/productos');
    } catch (error: unknown) {
      console.error('Error creating product:', error);
      const message = error instanceof Error ? error.message : undefined;
      toast.error(message || 'Error al crear producto. Intentá de nuevo.');
    }
  };

  const handleCancel = () => {
    router.push('/admin/productos');
  };

  if (isLoading || !user) return null;

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
