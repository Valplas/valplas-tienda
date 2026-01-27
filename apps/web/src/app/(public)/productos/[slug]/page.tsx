/**
 * Product Detail Page
 * Shows full product information with gallery and add to cart
 */

import { notFound } from 'next/navigation';
import { ProductDetail } from '@/components/product';
import { fake_getProductBySlug } from '@/lib/mock/services';
import { Metadata } from 'next';

interface ProductPageProps {
  params: {
    slug: string;
  };
}

// Generate metadata for SEO
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const response = await fake_getProductBySlug(params.slug);

  if (!response.success || !response.data) {
    return {
      title: 'Producto no encontrado'
    };
  }

  const product = response.data;

  return {
    title: `${product.name} | Valplas`,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      images: [product.image_url]
    }
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const response = await fake_getProductBySlug(params.slug);

  if (!response.success || !response.data) {
    notFound();
  }

  const product = response.data;

  return (
    <div className="container mx-auto px-4 py-8">
      <ProductDetail product={product} />
    </div>
  );
}
