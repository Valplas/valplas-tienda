import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { ProductsBrowser } from '@/components/product';
import { getCatalogProducts } from '@/lib/services/catalog.service';
import type { ProductPublic } from '@/types';

const ITEMS_PER_PAGE = 20;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * Catálogo — Server Component. Renderiza la primera página de productos en el
 * servidor (mejor LCP/SEO en mobile y redes lentas) y delega la interactividad
 * (filtros, paginación) a <ProductsBrowser>, que rehidrata con estos datos.
 */
export default async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const categoryId = first(sp.categoryId) ?? first(sp.category_id);
  const brandId = first(sp.brandId) ?? first(sp.brand_id);
  const search = first(sp.search);

  let initialProducts: ProductPublic[] = [];
  let initialTotal = 0;
  let initialTotalPages = 1;

  try {
    const response = await getCatalogProducts({
      search: search || undefined,
      categoryId: categoryId || undefined,
      brandId: brandId || undefined,
      page: 1,
      limit: ITEMS_PER_PAGE
    });

    if (response.success && response.data) {
      initialProducts = response.data;
      initialTotal = response.pagination?.total ?? 0;
      initialTotalPages = response.pagination?.totalPages ?? 1;
    }
  } catch (error) {
    console.error('Error loading products page data:', error);
  }

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
      <ProductsBrowser
        initialProducts={initialProducts}
        initialTotal={initialTotal}
        initialTotalPages={initialTotalPages}
      />
    </Suspense>
  );
}
