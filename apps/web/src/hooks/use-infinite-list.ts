'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface InfinitePage<T> {
  items: T[];
  hasMore: boolean;
  /** Cursor de la página siguiente (listados por cursor). */
  nextCursor?: string | null;
  /** Total, solo si el servidor lo informa (primera página en modo cursor). */
  total?: number | null;
}

export interface InfiniteFetchArgs {
  /** undefined en la primera página. */
  cursor?: string;
  /** Número de página (1 en la primera): para listados que siguen con OFFSET. */
  page: number;
}

interface UseInfiniteListOptions<T> {
  fetchPage: (args: InfiniteFetchArgs) => Promise<InfinitePage<T>>;
  /**
   * Identifica la consulta (filtros, orden, búsqueda). Cuando cambia se descarta lo cargado y se
   * pide la primera página: un cursor solo vale para la lista que lo generó.
   */
  resetKey: string;
  /** Si es false no se carga nada (p.ej. mientras se resuelve la sesión). */
  enabled?: boolean;
  onError?: (error: unknown, phase: 'first' | 'more') => void;
}

/**
 * Scroll infinito con paginación por cursor (o por página): primera carga, "cargar más" con un
 * IntersectionObserver sobre `sentinelRef` y descarte de respuestas de consultas viejas.
 */
export function useInfiniteList<T>({
  fetchPage,
  resetKey,
  enabled = true,
  onError
}: UseInfiniteListOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | undefined>(undefined);
  const pageRef = useRef(1);
  // Cada consulta nueva invalida las respuestas en vuelo de la anterior
  const requestIdRef = useRef(0);
  const fetchPageRef = useRef(fetchPage);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
    onErrorRef.current = onError;
  });

  // Es un contador, no un nodo del DOM: se necesita su valor actual al limpiar el efecto
  const invalidateInFlight = useCallback(() => {
    requestIdRef.current++;
  }, []);

  const loadFirst = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    cursorRef.current = undefined;
    pageRef.current = 1;
    setLoading(true);
    setLoadingMore(false);
    try {
      const result = await fetchPageRef.current({ page: 1 });
      if (requestId !== requestIdRef.current) return;
      setItems(result.items);
      setTotal(result.total ?? null);
      setHasMore(result.hasMore);
      cursorRef.current = result.nextCursor ?? undefined;
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setHasMore(false);
      onErrorRef.current?.(error, 'first');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const result = await fetchPageRef.current({ cursor: cursorRef.current, page: nextPage });
      if (requestId !== requestIdRef.current) return;
      pageRef.current = nextPage;
      setItems((prev) => [...prev, ...result.items]);
      setHasMore(result.hasMore);
      cursorRef.current = result.nextCursor ?? undefined;
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setHasMore(false);
      onErrorRef.current?.(error, 'more');
    } finally {
      if (requestId === requestIdRef.current) setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void loadFirst();
    return () => {
      // Desmontaje o cambio de consulta: lo que esté en vuelo ya no es válido
      invalidateInFlight();
    };
  }, [resetKey, enabled, loadFirst, invalidateInFlight]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          void loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [hasMore, loadingMore, loading, loadMore]);

  return {
    items,
    setItems,
    total,
    loading,
    loadingMore,
    hasMore,
    sentinelRef,
    reload: loadFirst
  };
}
