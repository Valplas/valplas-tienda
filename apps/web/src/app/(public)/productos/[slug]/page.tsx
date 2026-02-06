/**
 * Product Detail Page
 * Shows full product information with gallery and add to cart
 */

import { notFound } from 'next/navigation';
import { ProductDetail } from '@/components/product';
import { getProductBySlug } from '@/services';
import { Metadata } from 'next';

interface ProductPageProps {
  params: {
    slug: string;
  };
}

// Generate metadata for SEO
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  try {
    const product = await getProductBySlug(params.slug);

    const primaryImage =
      product.images?.find((img) => img.is_primary)?.url || product.images?.[0]?.url;

    return {
      title: `${product.name} | Valplas`,
      description: product.description,
      openGraph: {
        title: product.name,
        description: product.description,
        images: primaryImage ? [primaryImage] : []
      }
    };
  } catch (error) {
    return {
      title: 'Producto no encontrado'
    };
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  let product;
  try {
    product = await getProductBySlug(params.slug);
  } catch {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ProductDetail product={product as any} />
    </div>
  );
}
