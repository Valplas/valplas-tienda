'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserRole } from '@/types';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { formatDate } from '@/lib/formatters';
import {
  dismissMergeSuggestion,
  displayEmail,
  getMergeSuggestions,
  type MergeResult,
  type MergeSuggestion
} from '@/lib/services/user-merge.service';
import { MergeUsersDialog } from '@/components/admin/user-merge/merge-users-dialog';

const PAGE_SIZE = 20;

const pairKey = (s: MergeSuggestion) => `${s.user.id}:${s.legacyUser.id}`;
const fullName = (u: { firstName: string; lastName: string | null }) =>
  `${u.firstName} ${u.lastName ?? ''}`.trim();

export default function DuplicadosPage() {
  const { user: authUser, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });

  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<MergeSuggestion | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (nextPage: number) => {
    const result = await getMergeSuggestions(nextPage, PAGE_SIZE);
    setSuggestions((prev) =>
      nextPage === 1 ? result.suggestions : [...prev, ...result.suggestions]
    );
    setHasMore(result.hasMore);
    setPage(nextPage);
  }, []);

  const reloadFirstPage = useCallback(
    () => loadPage(1).catch(() => toast.error('Error al recargar posibles duplicados')),
    [loadPage]
  );

  useEffect(() => {
    loadPage(1)
      .catch(() => toast.error('Error al cargar posibles duplicados'))
      .finally(() => setLoading(false));
  }, [loadPage]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setLoadingMore(true);
          loadPage(page + 1)
            .catch(() => {
              setHasMore(false);
              toast.error('Error al cargar más duplicados');
            })
            .finally(() => setLoadingMore(false));
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, loadPage]);

  const handleDismiss = async (s: MergeSuggestion) => {
    setDismissing(pairKey(s));
    try {
      await dismissMergeSuggestion(s.user.id, s.legacyUser.id);
      setSuggestions((prev) => prev.filter((x) => pairKey(x) !== pairKey(s)));
      toast.success('Sugerencia descartada');
      // La paginación es por offset: sin recargar se saltearía una sugerencia por cada descarte
      await reloadFirstPage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo descartar');
    } finally {
      setDismissing(null);
    }
  };

  // Un merge invalida las sugerencias de esas dos cuentas: se sacan ya (aunque falle la recarga)
  // y se recarga desde la primera página
  const handleMerged = (result: MergeResult) => {
    const merged = new Set([result.sourceId, result.targetId]);
    setReviewing(null);
    setSuggestions((prev) =>
      prev.filter((s) => !merged.has(s.user.id) && !merged.has(s.legacyUser.id))
    );
    setLoading(true);
    reloadFirstPage().finally(() => setLoading(false));
  };

  if (authLoading || !authUser) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/usuarios"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Usuarios
        </Link>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Posibles duplicados</h1>
        <p className="text-muted-foreground">
          Cuentas nuevas que comparten dirección con un cliente migrado del CRM.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : suggestions.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          No hay posibles duplicados por ahora.
        </p>
      ) : (
        <ul className="space-y-3">
          {suggestions.map((s) => {
            const key = pairKey(s);
            const isDismissing = dismissing === key;
            return (
              <li key={key} className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={s.confidence === 'high' ? 'default' : 'secondary'}>
                    Coincidencia {s.confidence === 'high' ? 'alta' : 'media'}
                  </Badge>
                  <span className="inline-flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-1 h-4 w-4" />
                    {s.matchedAddress.street} {s.matchedAddress.streetNumber},{' '}
                    {s.matchedAddress.city}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-0.5 text-sm">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Cuenta nueva
                    </p>
                    <p className="font-semibold">{fullName(s.user)}</p>
                    <p className="break-all">{displayEmail(s.user.email)}</p>
                    <p className="text-muted-foreground">
                      {s.user.hasGoogle ? 'Google · ' : ''}Alta {formatDate(s.user.createdAt)}
                    </p>
                  </div>
                  <div className="space-y-0.5 text-sm">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Cliente del CRM
                    </p>
                    <p className="font-semibold">{fullName(s.legacyUser)}</p>
                    <p className="break-all">{displayEmail(s.legacyUser.email)}</p>
                    <p className="text-muted-foreground">{s.legacyUser.ordersCount} órdenes</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => handleDismiss(s)}
                    disabled={isDismissing}
                  >
                    {isDismissing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isDismissing ? 'Descartando...' : 'No es la misma persona'}
                  </Button>
                  <Button onClick={() => setReviewing(s)} disabled={isDismissing}>
                    Revisar y fusionar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div ref={sentinelRef} className="h-4" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {reviewing && (
        <MergeUsersDialog
          key={pairKey(reviewing)}
          keepUserId={reviewing.legacyUser.id}
          absorbUserId={reviewing.user.id}
          onClose={() => setReviewing(null)}
          onMerged={handleMerged}
        />
      )}
    </div>
  );
}
