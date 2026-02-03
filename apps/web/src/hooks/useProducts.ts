// apps/web/src/hooks/useProducts.ts

'use client';

import { useState, useEffect } from 'react';
import * as productsService from '@/lib/services/products.service';
import type { Product, ProductFilters } from '@/lib/services/products.service';

interface UseProductsResult {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  pagination: {
    page?: number;
    limit: number;
    total: number;
    totalPages?: number;
    hasMore: boolean;
  } | null;
  refetch: () => Promise<void>;
}

export function useProducts(filters?: ProductFilters): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<UseProductsResult['pagination']>(null);

  const fetchProducts = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await productsService.getProducts(filters);

      if (response.success && response.data) {
        setProducts(response.data);
        setPagination(response.pagination || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar productos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [JSON.stringify(filters)]);

  return {
    products,
    isLoading,
    error,
    pagination,
    refetch: fetchProducts
  };
}

/**
 * Hook para obtener un solo producto por ID
 */
export function useProduct(id: string | null) {
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setProduct(null);
      setIsLoading(false);
      return;
    }

    const fetchProduct = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await productsService.getProductById(id);
        setProduct(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar producto');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  return { product, isLoading, error };
}
