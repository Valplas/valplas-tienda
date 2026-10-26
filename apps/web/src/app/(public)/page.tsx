export const revalidate = 300; // Revalidar cada 5 minutos

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductGrid } from '@/components/product';
import { getCatalogProducts } from '@/lib/services/catalog.service';
import { getCategories } from '@/services';
import { Card, CardContent } from '@/components/ui/card';
import { BannerCarousel } from '@/components/home/banner-carousel';
import { getPublicBanners } from '@/lib/services/banners.service';
import { getStoreSettings } from '@/lib/services/settings.service';
import { StoreLogo } from '@/components/layout/store-logo';
import type { Category, ProductPublic } from '@/types';

export default async function Home() {
  let featuredProducts: ProductPublic[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let categories: any[] = [];
  // En paralelo con el resto; nunca rechazan, así un fallo de productos no
  // se lleva puestos los banners ni el logo. Settings es el mismo fetch del
  // layout: Next lo deduplica.
  const bannersPromise = getPublicBanners();
  const settingsPromise = getStoreSettings();

  try {
    const [productsRes, categoriesRes] = await Promise.all([
      getCatalogProducts({ limit: 8 }),
      getCategories()
    ]);

    featuredProducts = productsRes.success && productsRes.data ? productsRes.data : [];
    // Filter root categories (parent_id is null)

    categories = Array.isArray(categoriesRes)
      ? categoriesRes.filter((cat: Category) => cat.parentId === null)
      : [];
  } catch (error) {
    console.error('Error loading home page data:', error);
  }

  const [banners, settings] = await Promise.all([bannersPromise, settingsPromise]);

  return (
    <main className="container mx-auto px-4 py-4 space-y-6">
      {/* Hero: banners administrables; sin banners activos, el hero de texto */}
      {banners.length > 0 ? (
        <>
          <h1 className="sr-only">
            Valplas: Distribuidora de Artículos Plásticos, Productos de Limpieza y Electrodomésticos
          </h1>
          <BannerCarousel banners={banners} />
        </>
      ) : (
        <section className="text-center space-y-2 py-4">
          <h1 className="flex justify-center">
            <StoreLogo settings={settings} size="hero" />
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
            Distribuidora de Artículos Plásticos, Productos de Limpieza y Electrodomésticos
          </p>
          <div className="flex justify-center gap-4 pt-1">
            <Button asChild size="sm">
              <Link href="/productos">
                Ver Catálogo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      )}

      {/* Categories Section */}
      {categories.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Categorías</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/productos?category_id=${category.id}`}
                className="shrink-0"
              >
                <Card className="overflow-hidden transition-shadow hover:shadow-lg">
                  <CardContent className="px-5 py-3">
                    <h3 className="text-sm font-semibold whitespace-nowrap">{category.name}</h3>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products Section */}
      {featuredProducts.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Productos Destacados</h2>
            <Button asChild variant="ghost">
              <Link href="/productos">
                Ver todos
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <ProductGrid products={featuredProducts} />
        </section>
      )}
    </main>
  );
}
