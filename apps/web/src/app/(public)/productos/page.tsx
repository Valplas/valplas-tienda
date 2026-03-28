'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import type { ProductPublic, CatalogFilters } from '@/types';
import { ProductGrid, ProductFilters } from '@/components/product';
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
import { getCatalogProducts } from '@/lib/services/catalog.service';
import { useSearchParams } from 'next/navigation';

const ITEMS_PER_PAGE = 20;

function ProductsContent() {
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const searchParams = useSearchParams();

  const search = useFilterStore((state) => state.search);
  const categoryId = useFilterStore((state) => state.categoryId);
  const brandId = useFilterStore((state) => state.brandId);
  const setCategoryId = useFilterStore((state) => state.setCategoryId);
  const setBrandId = useFilterStore((state) => state.setBrandId);

  useEffect(() => {
    const categoryParam = searchParams.get('categoryId');
    const brandParam = searchParams.get('brandId');
    if (categoryParam) setCategoryId(categoryParam);
    if (brandParam) setBrandId(brandParam);
  }, [searchParams, setCategoryId, setBrandId]);

  const fetchWithFilters = useCallback(
    async (page: number) => {
      setIsLoading(true);
      try {
        const filters: CatalogFilters = {
          search: search || undefined,
          categoryId: categoryId || undefined,
          brandId: brandId || undefined,
          page,
          limit: ITEMS_PER_PAGE
        };

        const response = await getCatalogProducts(filters);

        if (response.success && response.data) {
          setProducts(response.data);
          setTotal(response.pagination?.total ?? 0);
          setTotalPages(response.pagination?.totalPages ?? 1);
        } else {
          setProducts([]);
          setTotal(0);
          setTotalPages(1);
        }
      } catch {
        setProducts([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        setIsLoading(false);
      }
    },
    [search, categoryId, brandId]
  );

  // When filters change: reset to page 1 and fetch immediately — atomic, no double fetch
  useEffect(() => {
    setCurrentPage(1);
    fetchWithFilters(1);
  }, [fetchWithFilters]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchWithFilters(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLoading ? 'Cargando...' : `${total} productos encontrados`}
            </p>
          </div>

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
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-20 rounded-lg border bg-card p-6">
              <ProductFilters />
            </div>
          </aside>

          <div className="space-y-6">
            {isLoading ? (
              <div className="flex min-h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <ProductGrid products={products} />

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

                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                          let pageNum: number;
                          if (totalPages <= 5) pageNum = i + 1;
                          else if (currentPage <= 3) pageNum = i + 1;
                          else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                          else pageNum = currentPage - 2 + i;

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
