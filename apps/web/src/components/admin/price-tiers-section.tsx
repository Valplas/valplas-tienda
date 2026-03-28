'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import { getPriceLists } from '@/services';
import { getProductTiers, replaceProductTiers } from '@/services';
import { formatPrice } from '@/lib/formatters';
import type { PriceList, PriceTier } from '@/types';

interface TierRow {
  priceListId: string;
  minQuantity: number;
}

interface PriceTiersSectionProps {
  productId?: string;
  costPrice?: number; // needed for price preview
}

export function PriceTiersSection({ productId, costPrice }: PriceTiersSectionProps) {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [rows, setRows] = useState<TierRow[]>([{ priceListId: '', minQuantity: 1 }]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [plRes, tiersData] = await Promise.all([
        getPriceLists({ isActive: true, limit: 100 }),
        productId ? getProductTiers(productId) : Promise.resolve([] as PriceTier[])
      ]);

      if (plRes.success && plRes.data) {
        setPriceLists(plRes.data.priceLists);
      }

      if (productId && tiersData.length > 0) {
        setRows(
          tiersData.map((t) => ({
            priceListId: t.priceListId ?? '',
            minQuantity: t.minQuantity
          }))
        );
      }
    } catch {
      toast.error('Error al cargar datos de precios');
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const unitPrice = (row: TierRow): number | null => {
    const pl = priceLists.find((p) => p.id === row.priceListId);
    if (!pl || !costPrice || costPrice <= 0) return null;
    return Math.trunc(costPrice * (1 + pl.margin / 100) * 100) / 100;
  };

  const addRow = () => {
    setRows((prev) => [...prev, { priceListId: '', minQuantity: 2 }]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<TierRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    if (!productId) return;

    const hasUnit = rows.some((r) => r.minQuantity === 1);
    if (!hasUnit) {
      toast.error('Debe existir un tier con cantidad mínima 1 (unidad)');
      return;
    }

    const incomplete = rows.some((r) => !r.priceListId);
    if (incomplete) {
      toast.error('Todos los tiers deben tener una lista de precios seleccionada');
      return;
    }

    const quantities = rows.map((r) => r.minQuantity);
    if (new Set(quantities).size !== quantities.length) {
      toast.error('No puede haber dos tiers con la misma cantidad mínima');
      return;
    }

    setIsSaving(true);
    try {
      await replaceProductTiers(productId, rows);
      toast.success('Tiers de precio guardados');
    } catch (error) {
      toast.error('Error al guardar tiers', {
        description: error instanceof Error ? error.message : 'Intenta nuevamente'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!productId) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Guardá el producto primero para poder configurar los tiers de precio.
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando tiers de precio...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 pr-4 font-medium text-muted-foreground">Bulto (cant. mín.)</th>
              <th className="pb-2 pr-4 font-medium text-muted-foreground">Lista de precios</th>
              <th className="pb-2 pr-4 font-medium text-muted-foreground">Precio/u</th>
              <th className="pb-2 font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, index) => {
              const isUnit = row.minQuantity === 1;
              const price = unitPrice(row);

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
                  <td className="py-2 pr-4 text-muted-foreground">
                    {price !== null ? formatPrice(price) : costPrice ? '—' : 'sin costo'}
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
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-2">
          <Plus className="h-4 w-4" />
          Agregar tier
        </Button>

        <LoadingButton type="button" size="sm" loading={isSaving} onClick={handleSave}>
          Guardar tiers
        </LoadingButton>
      </div>
    </div>
  );
}
