'use client';

import { useState, useCallback, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ArrowLeft, Search, Trash2, Plus, Loader2, MapPin, Package, Pencil } from 'lucide-react';
import { getAdminUserAddresses } from '@/lib/services/addresses.service';
import { getAdminProducts } from '@/lib/services/products.service';
import { getPriceLists, calculatePrice } from '@/lib/services/price-lists.service';
import { getAdminOrderById, adminUpdateOrder } from '@/lib/services/orders.service';
import { formatCurrency } from '@/lib/utils';
import type { Address } from '@/lib/services/addresses.service';
import type { PriceList } from '@/types';

interface OrderItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  available_stock: number;
  price_list_id: string;
  price_list_name: string;
  unit_price: number;
  quantity: number;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  available_stock: number;
}

export default function EditarPedidoPage({
  params: paramsPromise
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(paramsPromise);
  const router = useRouter();

  // Page state
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [orderNumber, setOrderNumber] = useState('');

  // Address
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);

  // Products
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [selectedPriceListId, setSelectedPriceListId] = useState('');
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState(1);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);

  // Order items
  const [items, setItems] = useState<OrderItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load order + addresses + price lists on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoadingOrder(true);
      try {
        const [order, priceListsRes] = await Promise.all([
          getAdminOrderById(id),
          getPriceLists({ isActive: true, limit: 100 })
        ]);

        if (cancelled) return;

        if (order.status !== 'processing') {
          toast.error('Este pedido ya no se puede editar');
          router.push(`/admin/pedidos/${id}`);
          return;
        }

        setOrderNumber(order.order_number);

        if (priceListsRes.success && priceListsRes.data) {
          setPriceLists(priceListsRes.data.priceLists);
        }

        // Load user addresses
        setIsLoadingAddresses(true);
        const addrs = await getAdminUserAddresses(order.user_id);
        if (!cancelled) {
          const active = addrs.filter((a) => a.is_active);
          setAddresses(active);

          // Pre-select address matching the order's shipping fields
          const match = active.find(
            (a) =>
              a.street === order.shipping_address?.street &&
              a.street_number === order.shipping_address?.street_number &&
              a.postcode === order.shipping_address?.postcode
          );
          if (match) setSelectedAddressId(match.id);
          else if (active.length === 1) setSelectedAddressId(active[0].id);
        }

        // Pre-populate items (available_stock is conservative, backend validates)
        const preloaded: OrderItem[] = order.items.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          available_stock: item.quantity + 999,
          price_list_id: '',
          price_list_name: '',
          unit_price: item.unit_price,
          quantity: item.quantity
        }));
        if (!cancelled) setItems(preloaded);
      } catch {
        if (!cancelled) {
          toast.error('Error al cargar pedido');
          router.push('/admin/pedidos');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingOrder(false);
          setIsLoadingAddresses(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  // Search products with debounce (min 3 chars)
  const searchProducts = useCallback(async (search: string) => {
    if (search.trim().length < 3) {
      setProductResults([]);
      return;
    }
    setIsSearchingProducts(true);
    try {
      const { products } = await getAdminProducts({ search, limit: 20 });
      setProductResults(
        products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          available_stock: p.available_stock ?? 0
        }))
      );
    } finally {
      setIsSearchingProducts(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchProducts(productSearch), 400);
    return () => clearTimeout(timer);
  }, [productSearch, searchProducts]);

  // Calculate price when product or price list changes
  useEffect(() => {
    if (!selectedProduct?.id || !selectedPriceListId) {
      setUnitPrice(0);
      return;
    }
    let cancelled = false;
    setIsCalculatingPrice(true);
    calculatePrice(selectedPriceListId, selectedProduct.id)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) setUnitPrice(res.data.unitPrice);
      })
      .catch(() => {
        if (!cancelled) setUnitPrice(0);
      })
      .finally(() => {
        if (!cancelled) setIsCalculatingPrice(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProduct?.id, selectedPriceListId]);

  const handleSelectProduct = useCallback((product: ProductSearchResult) => {
    setSelectedProduct(product);
    setProductSearch('');
    setProductResults([]);
    setSelectedPriceListId('');
    setUnitPrice(0);
    setQuantity(1);
  }, []);

  const handleEditItem = useCallback(
    (index: number) => {
      const item = items[index];
      setEditingIndex(index);
      setSelectedProduct({
        id: item.product_id,
        name: item.product_name,
        sku: item.product_sku,
        available_stock: item.available_stock
      });
      setSelectedPriceListId(item.price_list_id);
      setUnitPrice(item.unit_price);
      setQuantity(item.quantity);
      setProductSearch('');
      setProductResults([]);
    },
    [items]
  );

  const handleAddItem = useCallback(() => {
    if (!selectedProduct || unitPrice <= 0) {
      toast.error('Seleccioná un producto con precio válido');
      return;
    }
    if (quantity < 1) {
      toast.error('La cantidad debe ser al menos 1');
      return;
    }

    const priceList = priceLists.find((p) => p.id === selectedPriceListId);
    const newItem: OrderItem = {
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      product_sku: selectedProduct.sku,
      available_stock: selectedProduct.available_stock,
      price_list_id: selectedPriceListId,
      price_list_name: priceList?.name ?? '',
      unit_price: unitPrice,
      quantity
    };

    if (editingIndex !== null) {
      setItems((prev) => prev.map((item, i) => (i === editingIndex ? newItem : item)));
      setEditingIndex(null);
    } else {
      const existingIndex = items.findIndex((i) => i.product_id === selectedProduct.id);
      if (existingIndex >= 0) {
        setItems((prev) =>
          prev.map((item, i) =>
            i === existingIndex ? { ...item, quantity: item.quantity + quantity } : item
          )
        );
      } else {
        setItems((prev) => [...prev, newItem]);
      }
    }

    setSelectedProduct(null);
    setSelectedPriceListId('');
    setUnitPrice(0);
    setQuantity(1);
  }, [selectedProduct, selectedPriceListId, unitPrice, quantity, items, priceLists, editingIndex]);

  const handleRemoveItem = useCallback(
    (index: number) => {
      if (editingIndex === index) {
        setEditingIndex(null);
        setSelectedProduct(null);
        setSelectedPriceListId('');
        setUnitPrice(0);
        setQuantity(1);
      }
      setItems((prev) => prev.filter((_, i) => i !== index));
    },
    [editingIndex]
  );

  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  const handleSubmit = useCallback(async () => {
    if (!selectedAddressId) {
      toast.error('Seleccioná una dirección de entrega');
      return;
    }
    if (items.length === 0) {
      toast.error('El pedido debe tener al menos un producto');
      return;
    }

    setIsSubmitting(true);
    try {
      await adminUpdateOrder(id, {
        shipping_address_id: selectedAddressId,
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price
        }))
      });
      toast.success('Pedido actualizado correctamente');
      router.push(`/admin/pedidos/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar pedido');
    } finally {
      setIsSubmitting(false);
    }
  }, [id, selectedAddressId, items, router]);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  if (isLoadingOrder) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/admin/pedidos/${id}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Editar Pedido {orderNumber}
          </h1>
          <p className="text-muted-foreground mt-1">
            Modificá los productos y la dirección de entrega
          </p>
        </div>
      </div>

      {/* Address selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Dirección de entrega
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingAddresses ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando direcciones...
            </div>
          ) : addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este usuario no tiene direcciones registradas.
            </p>
          ) : (
            <div className="space-y-2">
              <Select value={selectedAddressId} onValueChange={setSelectedAddressId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná una dirección" />
                </SelectTrigger>
                <SelectContent>
                  {addresses.map((addr) => (
                    <SelectItem key={addr.id} value={addr.id}>
                      {addr.street} {addr.street_number}
                      {addr.floor ? `, Piso ${addr.floor}` : ''}
                      {addr.apartment ? ` ${addr.apartment}` : ''} — {addr.city} ({addr.postcode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAddress && (
                <p className="text-xs text-muted-foreground">
                  {selectedAddress.street} {selectedAddress.street_number}
                  {selectedAddress.floor ? `, Piso ${selectedAddress.floor}` : ''}
                  {selectedAddress.apartment ? ` ${selectedAddress.apartment}` : ''},{' '}
                  {selectedAddress.city}, {selectedAddress.province} ({selectedAddress.postcode})
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Productos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product search */}
          <div className="space-y-3">
            <Label>Buscar producto</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nombre, SKU o código..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-9"
              />
              {isSearchingProducts && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {productResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {productResults.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-4 py-2 hover:bg-muted transition-colors border-b last:border-0"
                      onClick={() => handleSelectProduct(p)}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-sm text-muted-foreground">
                        SKU: {p.sku} | Stock disponible: {p.available_stock}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected product form */}
            {selectedProduct && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <div>
                  <div className="font-medium">{selectedProduct.name}</div>
                  <div className="text-sm text-muted-foreground">
                    SKU: {selectedProduct.sku} | Stock disponible:{' '}
                    <span className="font-semibold">{selectedProduct.available_stock}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Lista de precios</Label>
                    <Select value={selectedPriceListId} onValueChange={setSelectedPriceListId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {priceLists.map((pl) => (
                          <SelectItem key={pl.id} value={pl.id}>
                            {pl.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm">Precio unitario</Label>
                    <div className="h-10 flex items-center px-3 border rounded-md bg-background text-sm">
                      {isCalculatingPrice ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : unitPrice > 0 ? (
                        <span className="font-medium">{formatCurrency(unitPrice)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm">Cantidad</Label>
                    <Input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                </div>

                {unitPrice > 0 && (
                  <div className="flex items-center justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-semibold text-base">
                      {formatCurrency(unitPrice * quantity)}
                    </span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button className="flex-1" onClick={handleAddItem} disabled={unitPrice <= 0}>
                    <Plus className="h-4 w-4 mr-2" />
                    {editingIndex !== null ? 'Actualizar ítem' : 'Agregar al pedido'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedProduct(null);
                      setSelectedPriceListId('');
                      setUnitPrice(0);
                      setQuantity(1);
                      setEditingIndex(null);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <div className="space-y-2">
              <Label>
                Productos del pedido{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  (hacé clic para editar)
                </span>
              </Label>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center w-20">Cant.</TableHead>
                      <TableHead className="text-right">P. Unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, i) => (
                      <TableRow
                        key={i}
                        className={`cursor-pointer hover:bg-muted/50 ${editingIndex === i ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                        onClick={() => editingIndex !== i && handleEditItem(i)}
                      >
                        <TableCell>
                          <div className="font-medium text-sm">{item.product_name}</div>
                          <div className="text-xs text-muted-foreground">{item.product_sku}</div>
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(item.unit_price)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {formatCurrency(item.unit_price * item.quantity)}
                        </TableCell>
                        <TableCell>
                          <div
                            className="flex gap-1 justify-end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Editar ${item.product_name}`}
                              onClick={() => handleEditItem(i)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              aria-label={`Eliminar ${item.product_name}`}
                              onClick={() => handleRemoveItem(i)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end text-sm">
                <span className="text-muted-foreground mr-4">Total:</span>
                <span className="font-bold text-base">{formatCurrency(subtotal)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push(`/admin/pedidos/${id}`)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={isSubmitting || items.length === 0 || !selectedAddressId}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar cambios'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
