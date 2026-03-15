'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDailySummary } from '@/lib/services/accounting.service';
import type { DailySummary, ProductDailySale } from '@/lib/services/accounting.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';

function getTodayArgentina(): string {
  return new Date().toLocaleDateString('sv', { timeZone: 'America/Argentina/Buenos_Aires' });
}

function formatDisplayDate(dateStr: string): string {
  return dayjs(dateStr).format('DD-MM-YYYY');
}

function generateCSV(summary: DailySummary): string {
  const headers = [
    'Producto',
    'En Stock',
    'Precio Compra',
    'Total Vendidos',
    'Total Ganancia',
    'Lista de Precios',
    'Margen %',
    'Cantidad',
    'Ganancia'
  ];

  const rows: string[][] = [];

  for (const product of summary.products) {
    for (const sale of product.price_list_sales) {
      rows.push([
        product.product_name,
        String(product.available_stock),
        String(product.cost_price),
        String(product.total_quantity),
        String(product.total_ganancia),
        sale.price_list_name ?? 'Sin lista',
        sale.margin_percentage !== null ? String(sale.margin_percentage) : '',
        String(sale.quantity_sold),
        String(sale.ganancia)
      ]);
    }

    // If product has no price list sales, still emit one row
    if (product.price_list_sales.length === 0) {
      rows.push([
        product.product_name,
        String(product.available_stock),
        String(product.cost_price),
        String(product.total_quantity),
        String(product.total_ganancia),
        '',
        '',
        '',
        ''
      ]);
    }
  }

  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const csvLines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))];

  return csvLines.join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded" />
      ))}
    </div>
  );
}

interface ProductRowsProps {
  product: ProductDailySale;
}

function ProductRows({ product }: ProductRowsProps) {
  return (
    <>
      {/* Product summary row */}
      <tr className="border-t border-border">
        <td className="py-3 pr-4 font-medium">
          <div>{product.product_name}</div>
          <div className="text-xs text-muted-foreground font-mono">{product.product_sku}</div>
        </td>
        <td className="py-3 pr-4 text-center">{product.available_stock}</td>
        <td className="py-3 pr-4 text-right">{formatCurrency(product.cost_price)}</td>
        <td className="py-3 pr-4 text-center font-semibold">{product.total_quantity}</td>
        <td className="py-3 text-right font-semibold text-green-700 dark:text-green-400">
          {formatCurrency(product.total_ganancia)}
        </td>
      </tr>

      {/* Price list sub-header */}
      {product.price_list_sales.length > 0 && (
        <tr className="bg-muted/30">
          <td className="py-1.5 pl-6 pr-4 text-xs font-bold text-muted-foreground uppercase tracking-wide">
            Lista de precios
          </td>
          <td className="py-1.5 pr-4 text-xs font-bold text-muted-foreground uppercase tracking-wide">
            Margen de ganancia
          </td>
          <td className="py-1.5 pr-4 text-xs font-bold text-muted-foreground uppercase tracking-wide">
            Cantidad vendida
          </td>
          <td
            className="py-1.5 pr-4 text-xs font-bold text-muted-foreground uppercase tracking-wide"
            colSpan={2}
          >
            Ganancia
          </td>
        </tr>
      )}

      {/* Price list sub-rows */}
      {product.price_list_sales.map((sale, idx) => (
        <tr key={idx} className="bg-muted/10 hover:bg-muted/20">
          <td className="py-2 pl-6 pr-4 text-sm text-muted-foreground">
            {sale.price_list_name ?? 'Sin lista'}
          </td>
          <td className="py-2 pr-4 text-sm text-muted-foreground">
            {sale.margin_percentage !== null ? `${sale.margin_percentage}%` : '—'}
          </td>
          <td className="py-2 pr-4 text-sm text-center text-muted-foreground">
            {sale.quantity_sold}
          </td>
          <td className="py-2 text-sm text-right text-muted-foreground" colSpan={2}>
            {formatCurrency(sale.ganancia)}
          </td>
        </tr>
      ))}
    </>
  );
}

export default function ContabilidadPage() {
  const [date, setDate] = useState<string>(getTodayArgentina);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSummary = useCallback(async (selectedDate: string) => {
    setIsLoading(true);
    try {
      const data = await getDailySummary(selectedDate);
      setSummary(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cargar resumen';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary(date);
  }, [date, loadSummary]);

  const handleExportCSV = () => {
    if (!summary) return;
    const csv = generateCSV(summary);
    downloadCSV(csv, `resumen-ventas-${date}.csv`);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Title */}
        <h1 className="text-2xl font-bold sm:text-3xl">Resumen ventas</h1>

        {/* CSV button — center on desktop */}
        <div className="flex justify-center">
          <Button onClick={handleExportCSV} disabled={isLoading || !summary}>
            <Download className="mr-2 h-4 w-4" />
            Generar CSV
          </Button>
        </div>

        {/* Date + total — right aligned */}
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
          <div className="text-sm font-medium">
            {isLoading ? (
              <Skeleton className="h-4 w-48" />
            ) : (
              <span>
                Ganancia del dia {formatDisplayDate(date)}:{' '}
                <span className="text-green-700 dark:text-green-400 font-semibold">
                  {formatCurrency(summary?.total_ganancia ?? 0)}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : !summary || summary.products.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            No hay ventas registradas para el {formatDisplayDate(date)}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Producto
                </th>
                <th className="py-3 pr-4 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  En Stock
                </th>
                <th className="py-3 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Precio Compra
                </th>
                <th className="py-3 pr-4 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total Vendidos
                </th>
                <th className="py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total Ganancia
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.products.map((product) => (
                <ProductRows key={product.product_id} product={product} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/50">
                <td colSpan={4} className="py-3 pr-4 font-bold text-right">
                  Ganancia total del día:
                </td>
                <td className="py-3 text-right font-bold text-green-700 dark:text-green-400 text-base">
                  {formatCurrency(summary.total_ganancia)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
