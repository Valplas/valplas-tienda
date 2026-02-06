'use client';

/**
 * SearchBar Component
 * Search input with autocomplete suggestions
 */

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebounce } from '@/hooks/use-debounce';
import { getProducts } from '@/services';
import { Product } from '@/types';
import Link from 'next/link';
import Image from 'next/image';
import { formatPrice } from '@/lib/formatters';
import { useRouter } from 'next/navigation';

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search products
  useEffect(() => {
    const searchProducts = async () => {
      if (!debouncedQuery.trim()) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await getProducts({
          search: debouncedQuery,
          limit: 5
        });

        if (response.success && response.data) {
          setResults(response.data as any);
          setIsOpen(true);
        }
      } catch (error) {
        console.error('Error searching products:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    searchProducts();
  }, [debouncedQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/productos?search=${encodeURIComponent(query.trim())}`);
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar productos..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (results.length > 0) setIsOpen(true);
            }}
            className="w-full pl-9 pr-9"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>

      {/* Autocomplete Dropdown */}
      {isOpen && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Buscando...</div>
          ) : results.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto">
              {results.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/productos/${product.slug}`}
                    className="flex items-center gap-3 border-b p-3 transition-colors hover:bg-accent last:border-b-0"
                    onClick={() => {
                      setIsOpen(false);
                      setQuery('');
                    }}
                  >
                    {/* Product Image */}
                    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded border bg-muted">
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          Sin img
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatPrice(product.final_price)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={`/productos?search=${encodeURIComponent(query.trim())}`}
                  className="block border-t bg-muted/50 p-3 text-center text-sm font-medium text-primary hover:bg-muted"
                  onClick={() => setIsOpen(false)}
                >
                  Ver todos los resultados
                </Link>
              </li>
            </ul>
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No se encontraron productos
            </div>
          )}
        </div>
      )}
    </div>
  );
}
