/**
 * Products Catalog Page
 * Shows all products with filters, search, and pagination
 */

'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { Product, ProductFilters as ProductFiltersType } from '@/types';
import { ProductGrid, ProductFilters, ProductSort } from '@/components/product';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import { useFilterStore } from '@/stores/filter-store';
import { getProducts } from '@/services';
import { sortProducts } from '@/lib/utils/sort-products';
import { useSearchParams } from 'next/navigation';

const ITEMS_PER_PAGE = 20;

function ProductsContent() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sortedProducts, setSortedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const searchParams = useSearchParams();

  // Filter store
  const search = useFilterStore((state) => state.search);
  const categoryId = useFilterStore((state) => state.category_id);
  const brandId = useFilterStore((state) => state.brand_id);
  const minPrice = useFilterStore((state) => state.min_price);
  const maxPrice = useFilterStore((state) => state.max_price);
  const sortBy = useFilterStore((state) => state.sortBy);
  const setCategoryId = useFilterStore((state) => state.setCategoryId);
  const setBrandId = useFilterStore((state) => state.setBrandId);

  // Initialize filters from URL params
  useEffect(() => {
    const categoryParam = searchParams.get('category_id');
    const brandParam = searchParams.get('brand_id');

    if (categoryParam) {
      setCategoryId(categoryParam);
    }
    if (brandParam) {
      setBrandId(brandParam);
    }
  }, [searchParams, setCategoryId, setBrandId]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);

    const filters: ProductFiltersType = {
      search,
      category_id: categoryId,
      brand_id: brandId,
      min_price: minPrice,
      max_price: maxPrice,
      is_active: true
    };

    try {
      const response = await getProducts({
        search,
        categoryId,
        brandId,
        minPrice,
        maxPrice,
        page: currentPage,
        limit: ITEMS_PER_PAGE
      });

      if (response.success && response.data) {
        setProducts(response.data as any); // Type assertion for Product compatibility
        setTotal(response.pagination?.total || 0);
        setTotalPages(response.pagination?.totalPages || 1);
      } else {
        setProducts([]);
        setTotal(0);
        setTotalPages(1);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [search, categoryId, brandId, minPrice, maxPrice, currentPage]);

  // Fetch on filter change
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Apply client-side sorting
  useEffect(() => {
    const sorted = sortProducts(products, sortBy);
    setSortedProducts(sorted);
  }, [products, sortBy]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryId, brandId, minPrice, maxPrice]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLoading ? 'Cargando...' : `${total} productos encontrados`}
            </p>
          </div>

          {/* Mobile Filter Toggle + Sort */}
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Filtros
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-md">
                <ProductFilters />
              </SheetContent>
            </Sheet>

            <div className="hidden sm:block">
              <ProductSort />
            </div>
          </div>
        </div>

        {/* Mobile Sort */}
        <div className="sm:hidden">
          <ProductSort />
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Desktop Filters Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-20 rounded-lg border bg-card p-6">
              <ProductFilters />
            </div>
          </aside>

          {/* Products Grid */}
          <div className="space-y-6">
            {isLoading ? (
              <div className="flex min-h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <ProductGrid products={sortedProducts} />

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center pt-6">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => handlePageChange(currentPage - 1)}
                            className={
                              currentPage === 1
                                ? 'pointer-events-none opacity-50'
                                : 'cursor-pointer'
                            }
                          />
                        </PaginationItem>

                        {/* Page numbers */}
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                          let pageNum: number;

                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }

                          return (
                            <PaginationItem key={pageNum}>
                              <PaginationLink
                                onClick={() => handlePageChange(pageNum)}
                                isActive={currentPage === pageNum}
                                className="cursor-pointer"
                              >
                                {pageNum}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}

                        <PaginationItem>
                          <PaginationNext
                            onClick={() => handlePageChange(currentPage + 1)}
                            className={
                              currentPage === totalPages
                                ? 'pointer-events-none opacity-50'
                                : 'cursor-pointer'
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <div className="flex min-h-[400px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
