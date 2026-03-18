import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductGrid } from '@/components/product';
import { getCatalogProducts } from '@/lib/services/catalog.service';
import { getCategories } from '@/services';
import { Card, CardContent } from '@/components/ui/card';
import type { Category, ProductPublic } from '@/types';

export default async function Home() {
  let featuredProducts: ProductPublic[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let categories: any[] = [];

  try {
    const [productsRes, categoriesRes] = await Promise.all([
      getCatalogProducts({ limit: 8 }),
      getCategories()
    ]);

    featuredProducts = productsRes.success && productsRes.data ? productsRes.data : [];
    // Filter root categories (parent_id is null)

    categories = Array.isArray(categoriesRes)
      ? categoriesRes.filter((cat: Category) => cat.parent_id === null)
      : [];
  } catch (error) {
    console.error('Error loading home page data:', error);
  }

  return (
    <main className="container mx-auto px-4 py-8 space-y-12">
      {/* Hero Section */}
      <section className="text-center space-y-4 py-12">
        <h1 className="text-4xl font-bold tracking-tight text-primary sm:text-5xl md:text-6xl">
          Valplas
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Distribuidora de Artículos Plásticos, Productos de Limpieza y Electrodomésticos
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Button asChild size="lg">
            <Link href="/productos">
              Ver Catálogo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Categories Section */}
      {categories.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Categorías</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {categories.map((category) => (
              <Link key={category.id} href={`/productos?category_id=${category.id}`}>
                <Card className="overflow-hidden transition-shadow hover:shadow-lg">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold">{category.name}</h3>
                    {category.description && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {category.description}
                      </p>
                    )}
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
            <h2 className="text-2xl font-bold tracking-tight">Productos Destacados</h2>
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
