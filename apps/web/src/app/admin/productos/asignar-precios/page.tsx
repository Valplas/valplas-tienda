'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';
import { getCategories, getBrands, getPriceLists } from '@/services';
import { bulkPreviewTiers, bulkConfirmTiers } from '@/services';
import type { BulkTierInput, BulkPreviewResult } from '@/services';
import type { Category, Brand, PriceList } from '@/types';

type FilterType = 'all' | 'category' | 'brand';
type Step = 'configure' | 'preview';

interface TierRow {
  priceListId: string;
  minQuantity: number;
}

export default function BulkPriceAssignmentPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [rows, setRows] = useState<TierRow[]>([{ priceListId: '', minQuantity: 1 }]);

  const [step, setStep] = useState<Step>('configure');
  const [preview, setPreview] = useState<BulkPreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoadingData(true);
      try {
        const [cats, brs, pls] = await Promise.all([
          getCategories(),
          getBrands(),
          getPriceLists({ isActive: true, limit: 100 })
        ]);
        setCategories(cats);
        setBrands(brs);
        if (pls.success && pls.data) setPriceLists(pls.data.priceLists);
      } catch {
        toast.error('Error al cargar datos');
      } finally {
        setIsLoadingData(false);
      }
    };
    loadData();
  }, []);

  const addRow = () => {
    setRows((prev) => [...prev, { priceListId: '', minQuantity: 2 }]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<TierRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const buildFilter = () => {
    if (filterType === 'category' && categoryId) return { categoryId };
    if (filterType === 'brand' && brandId) return { brandId };
    return { all: true };
  };

  const validateRows = (): string | null => {
    const hasUnit = rows.some((r) => r.minQuantity === 1);
    if (!hasUnit) return 'Debe incluir un tier con cantidad mínima 1 (unidad)';
    if (rows.some((r) => !r.priceListId)) return 'Todos los tiers deben tener una lista de precios';
    const quantities = rows.map((r) => r.minQuantity);
    if (new Set(quantities).size !== quantities.length)
      return 'No puede haber dos tiers con la misma cantidad mínima';
    return null;
  };

  const handlePreview = async () => {
    const error = validateRows();
    if (error) {
      toast.error(error);
      return;
    }
    if (filterType === 'category' && !categoryId) {
      toast.error('Seleccioná una categoría');
      return;
    }
    if (filterType === 'brand' && !brandId) {
      toast.error('Seleccioná una marca');
      return;
    }

    setIsPreviewing(true);
    try {
      const tiers: BulkTierInput[] = rows.map((r) => ({
        priceListId: r.priceListId,
        minQuantity: r.minQuantity
      }));
      const result = await bulkPreviewTiers(tiers, buildFilter());
      setPreview(result);
      setStep('preview');
    } catch (error) {
      toast.error('Error al obtener preview', {
        description: error instanceof Error ? error.message : 'Intenta nuevamente'
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConfirm = async (conflictResolution: 'skip' | 'overwrite') => {
    const tiers: BulkTierInput[] = rows.map((r) => ({
      priceListId: r.priceListId,
      minQuantity: r.minQuantity
    }));

    setIsConfirming(true);
    try {
      const result = await bulkConfirmTiers(tiers, buildFilter(), conflictResolution);
      toast.success('Tiers asignados correctamente', {
        description: [
          result.assigned > 0 && `${result.assigned} asignados`,
          result.overwritten > 0 && `${result.overwritten} sobreescritos`,
          result.skipped > 0 && `${result.skipped} omitidos`
        ]
          .filter(Boolean)
          .join(', ')
      });
      router.push('/admin/productos');
    } catch (error) {
      toast.error('Error al confirmar asignación', {
        description: error instanceof Error ? error.message : 'Intenta nuevamente'
      });
    } finally {
      setIsConfirming(false);
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/productos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asignar a todos</h1>
          <p className="text-muted-foreground mt-1">
            Asigná listas de precio a múltiples productos de una vez
          </p>
        </div>
      </div>

      {isLoadingData ? (
        <div className="text-sm text-muted-foreground">Cargando datos...</div>
      ) : step === 'configure' ? (
        <div className="space-y-6 max-w-2xl">
          {/* Filter */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold">¿A qué productos aplicar?</h2>
            <div className="flex flex-wrap gap-2">
              {(['all', 'category', 'brand'] as FilterType[]).map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={filterType === t ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterType(t)}
                >
                  {t === 'all'
                    ? 'Todos los productos'
                    : t === 'category'
                      ? 'Por categoría'
                      : 'Por marca'}
                </Button>
              ))}
            </div>

            {filterType === 'category' && (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Seleccionar categoría..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {filterType === 'brand' && (
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Seleccionar marca..." />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Tiers table */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold">Tiers a asignar</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">
                    Bulto (cant. mín.)
                  </th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">Lista de precios</th>
                  <th className="pb-2 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, index) => {
                  const isUnit = row.minQuantity === 1;
                  return (
                    <tr key={index}>
                      <td className="py-2 pr-4">
                        {isUnit ? (
                          <span className="text-muted-foreground">1 (unidad)</span>
                        ) : (
                          <input
                            type="number"
                            min={2}
                            value={row.minQuantity}
                            onChange={(e) =>
                              updateRow(index, {
                                minQuantity: Math.max(2, parseInt(e.target.value) || 2)
                              })
                            }
                            className="w-20 rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <Select
                          value={row.priceListId}
                          onValueChange={(v) => updateRow(index, { priceListId: v })}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Seleccionar lista..." />
                          </SelectTrigger>
                          <SelectContent>
                            {priceLists.map((pl) => (
                              <SelectItem key={pl.id} value={pl.id}>
                                {pl.name} ({pl.margin}%)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={isUnit}
                          onClick={() => removeRow(index)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:opacity-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-2">
              <Plus className="h-4 w-4" />
              Agregar lista de precios
            </Button>
          </div>

          <LoadingButton loading={isPreviewing} onClick={handlePreview} className="gap-2">
            Ver vista previa
          </LoadingButton>
        </div>
      ) : (
        /* Preview step */
        <div className="space-y-6 max-w-2xl">
          {preview && (
            <>
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">
                  ✓ {preview.toAssign.length} producto(s) se actualizarán sin conflicto
                </p>
                {preview.conflicts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-amber-600">
                      ⚠ {preview.conflicts.length} producto(s) tienen conflictos:
                    </p>
                    <ul className="space-y-1 text-sm text-muted-foreground pl-4">
                      {preview.conflicts.map((c, i) => (
                        <li key={i}>
                          <span className="font-medium text-foreground">{c.productName}</span> →{' '}
                          bulto x{c.minQuantity}: &ldquo;{c.existingPriceListName}&rdquo; → &ldquo;
                          {c.newPriceListName}&rdquo;
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {preview.conflicts.length > 0 && (
                  <>
                    <LoadingButton
                      variant="outline"
                      loading={isConfirming}
                      onClick={() => handleConfirm('skip')}
                    >
                      Omitir conflictos
                    </LoadingButton>
                    <LoadingButton
                      loading={isConfirming}
                      onClick={() => handleConfirm('overwrite')}
                    >
                      Sobreescribir todos
                    </LoadingButton>
                  </>
                )}
                {preview.conflicts.length === 0 && (
                  <LoadingButton loading={isConfirming} onClick={() => handleConfirm('skip')}>
                    Confirmar asignación
                  </LoadingButton>
                )}
                <Button
                  variant="ghost"
                  disabled={isConfirming}
                  onClick={() => setStep('configure')}
                >
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
