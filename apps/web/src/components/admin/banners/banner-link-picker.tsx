'use client';

import * as React from 'react';
import { ExternalLink, MousePointerClick } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  SearchableSelect,
  type SearchableSelectOption
} from '@/components/admin/searchable-select';
import { getAdminBrands, getAdminProducts, getCategories } from '@/services';
import { buildBannerHref, describeBannerLink } from '@/lib/banners';
import type { Category } from '@/types';

export interface BannerLinkTarget {
  id: string;
  name: string;
}

export interface BannerLinkValue {
  brand: BannerLinkTarget | null;
  category: BannerLinkTarget | null;
  product: (BannerLinkTarget & { slug: string }) | null;
}

interface BannerLinkPickerProps {
  value: BannerLinkValue;
  onChange: (value: BannerLinkValue) => void;
  disabled?: boolean;
}

type ProductOption = SearchableSelectOption & { slug: string };

const PRODUCT_RESULTS_LIMIT = 20;
const BRANDS_LIMIT = 100;

/** "Padre › Hijo" para que se distingan subcategorías con el mismo nombre. */
function categoryOptions(categories: Category[]): SearchableSelectOption[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const pathOf = (category: Category): string => {
    const parent = category.parentId ? byId.get(category.parentId) : undefined;
    return parent ? `${pathOf(parent)} › ${category.name}` : category.name;
  };
  return categories
    .filter((category) => category.isActive)
    .map((category) => ({ value: category.id, label: pathOf(category) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/**
 * Destino del clic del banner, pensado para usuarios no técnicos: marca y
 * categoría arman un catálogo filtrado y además acotan la búsqueda de
 * producto; si se elige un producto, el banner abre directo su ficha.
 */
export function BannerLinkPicker({ value, onChange, disabled }: BannerLinkPickerProps) {
  const [brands, setBrands] = React.useState<SearchableSelectOption[]>([]);
  const [categories, setCategories] = React.useState<SearchableSelectOption[]>([]);

  React.useEffect(() => {
    let active = true;
    Promise.all([getAdminBrands({ limit: BRANDS_LIMIT }), getCategories()])
      .then(([brandsData, categoriesData]) => {
        if (!active) return;
        setBrands(
          brandsData.brands
            .filter((brand) => brand.isActive)
            .map((brand) => ({ value: brand.id, label: brand.name }))
            .sort((a, b) => a.label.localeCompare(b.label, 'es'))
        );
        setCategories(categoryOptions(categoriesData));
      })
      .catch(() => {
        // Sin listas el usuario igual puede elegir un producto por búsqueda
      });
    return () => {
      active = false;
    };
  }, []);

  const brandId = value.brand?.id;
  const categoryId = value.category?.id;

  const searchProducts = React.useCallback(
    async (term: string): Promise<ProductOption[]> => {
      const { products } = await getAdminProducts({
        search: term || undefined,
        brandId,
        categoryId,
        isActive: true,
        sort: 'name_asc',
        limit: PRODUCT_RESULTS_LIMIT
      });
      return products.map((product) => ({
        value: product.id,
        label: product.name,
        description: [product.brand?.name, product.sku].filter(Boolean).join(' · '),
        slug: product.slug
      }));
    },
    [brandId, categoryId]
  );

  const href = buildBannerHref({
    linkProductSlug: value.product?.slug ?? null,
    linkCategoryId: value.category?.id ?? null,
    linkBrandId: value.brand?.id ?? null
  });

  const summary = describeBannerLink({
    productName: value.product?.name,
    categoryName: value.category?.name,
    brandName: value.brand?.name
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="banner-link-brand">Marca</Label>
        <SearchableSelect
          id="banner-link-brand"
          value={value.brand?.id ?? null}
          selectedLabel={value.brand?.name}
          options={brands}
          onChange={(option) =>
            onChange({ ...value, brand: option ? { id: option.value, name: option.label } : null })
          }
          placeholder="Cualquier marca"
          searchPlaceholder="Buscar marca..."
          disabled={disabled}
          clearLabel="Quitar marca"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="banner-link-category">Categoría</Label>
        <SearchableSelect
          id="banner-link-category"
          value={value.category?.id ?? null}
          selectedLabel={value.category?.name}
          options={categories}
          onChange={(option) =>
            onChange({
              ...value,
              category: option ? { id: option.value, name: option.label } : null
            })
          }
          placeholder="Cualquier categoría"
          searchPlaceholder="Buscar categoría..."
          disabled={disabled}
          clearLabel="Quitar categoría"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="banner-link-product">Producto (opcional)</Label>
        <SearchableSelect
          id="banner-link-product"
          value={value.product?.id ?? null}
          selectedLabel={value.product?.name}
          onSearch={searchProducts}
          onChange={(option) =>
            onChange({
              ...value,
              product: option
                ? {
                    id: option.value,
                    name: option.label,
                    slug: option.slug
                  }
                : null
            })
          }
          placeholder="Ninguno: mostrar el catálogo filtrado"
          searchPlaceholder="Buscar por nombre o código..."
          emptyText={
            brandId || categoryId
              ? 'No hay productos con esa marca/categoría'
              : 'No se encontraron productos'
          }
          disabled={disabled}
          clearLabel="Quitar producto"
        />
        <p className="text-xs text-muted-foreground">
          {value.product
            ? 'Como elegiste un producto, la marca y la categoría solo sirven para encontrarlo más rápido.'
            : 'Si elegís marca o categoría, la lista de productos se achica a esos.'}
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-md border bg-muted/50 p-3">
        <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">Al tocar el banner:</p>
          <p className="text-sm">{summary}</p>
        </div>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Probar
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
