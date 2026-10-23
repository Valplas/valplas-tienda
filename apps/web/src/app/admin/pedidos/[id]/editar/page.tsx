'use client';

import { useState, useCallback, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Search,
  Trash2,
  Plus,
  Loader2,
  MapPin,
  Package,
  Pencil,
  AlertTriangle,
  Lock,
  Truck
} from 'lucide-react';
import { getAdminUserAddresses } from '@/lib/services/addresses.service';
import { getAdminProducts } from '@/lib/services/products.service';
import { getPriceLists, calculatePrice } from '@/lib/services/price-lists.service';
import { getAdminOrderById, adminUpdateOrder } from '@/lib/services/orders.service';
import { quoteShipping } from '@/lib/services/shipping.service';
import { AdminAddressForm } from '@/components/admin/admin-address-form';
import { formatCurrency } from '@/lib/utils';
import type { Address } from '@/lib/services/addresses.service';
import type { OrderShippingAddress, ShippingCostMode } from '@/lib/services/orders.service';
import type { PriceList } from '@/types';

interface OrderItem {
  productId: string;
  productName: string;
  productSku: string;
  availableStock: number;
  priceListId: string;
  priceListName: string;
  unitPrice: number;
  quantity: number;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  availableStock: number;
}

/** Datos de envío del pedido al cargarlo (snapshot + carrier) */
interface OrderShipping {
  address: OrderShippingAddress | null;
  carrierId: string | null;
  carrierName: string | null;
  carrierIsExternal: boolean;
  cost: number;
}

/** null = form cerrado, 'new' = alta, Address = edición */
type AddressFormTarget = null | 'new' | Address;

type ShippingQuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; cost: number }
  | { status: 'unavailable'; message: string };

const ADDRESS_FIELDS = [
  'street',
  'streetNumber',
  'floor',
  'apartment',
  'city',
  'province',
  'postcode'
] as const;

/** Misma dirección que el snapshot del pedido (mismo id y mismos datos) */
function isOrderAddress(address: Address, orderAddress: OrderShippingAddress | null): boolean {
  if (!orderAddress || address.id !== orderAddress.id) return false;
  return ADDRESS_FIELDS.every((field) => (address[field] ?? '') === (orderAddress[field] ?? ''));
}

function formatAddressLine(a: {
  street: string;
  streetNumber: string;
  floor?: string | null;
  apartment?: string | null;
  city: string;
  province: string;
  postcode: string;
}): string {
  return `${a.street} ${a.streetNumber}${a.floor ? `, Piso ${a.floor}` : ''}${
    a.apartment ? ` ${a.apartment}` : ''
  }, ${a.city}, ${a.province} (${a.postcode})`;
}

export default function EditarPedidoPage({
  params: paramsPromise
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });
  const { id } = use(paramsPromise);
  const router = useRouter();

  // Page state
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderUserId, setOrderUserId] = useState('');
  const [orderShipping, setOrderShipping] = useState<OrderShipping>({
    address: null,
    carrierId: null,
    carrierName: null,
    carrierIsExternal: false,
    cost: 0
  });

  // Address
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [addressFormTarget, setAddressFormTarget] = useState<AddressFormTarget>(null);

  // Shipping cost when the address changes
  const [shippingQuote, setShippingQuote] = useState<ShippingQuoteState>({ status: 'idle' });
  const [shippingCostMode, setShippingCostMode] = useState<ShippingCostMode | null>(null);

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

        setOrderNumber(order.orderNumber);
        setOrderUserId(order.userId);
        setOrderShipping({
          address: order.shippingAddress ?? null,
          carrierId: order.shippingCarrierId ?? null,
          carrierName: order.carrierName ?? null,
          carrierIsExternal: order.shippingCarrierIsExternal ?? false,
          cost: Number(order.shippingCost ?? 0)
        });

        if (priceListsRes.success && priceListsRes.data) {
          setPriceLists(priceListsRes.data.priceLists);
        }

        // Load user addresses
        setIsLoadingAddresses(true);
        const addrs = await getAdminUserAddresses(order.userId);
        if (!cancelled) {
          const active = addrs.filter((a) => a.isActive);
          setAddresses(active);

          // Pre-select the order's address: by id (shipping_address_id), then by fields
          const current = order.shippingAddress;
          const match =
            active.find((a) => a.id === current?.id) ??
            active.find(
              (a) =>
                a.street === current?.street &&
                a.streetNumber === current?.streetNumber &&
                a.postcode === current?.postcode
            );
          if (match) setSelectedAddressId(match.id);
          // Sin dirección en el pedido y una sola guardada: proponerla
          else if (!current && active.length === 1) setSelectedAddressId(active[0].id);
        }

        // Pre-populate items (availableStock is conservative, backend validates)
        const preloaded: OrderItem[] = order.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          availableStock: item.quantity + 999,
          priceListId: (item as unknown as { priceListId?: string }).priceListId ?? '',
          priceListName: '',
          unitPrice: item.unitPrice,
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
          availableStock: p.availableStock ?? 0
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
        id: item.productId,
        name: item.productName,
        sku: item.productSku,
        availableStock: item.availableStock
      });
      setSelectedPriceListId(item.priceListId);
      setUnitPrice(item.unitPrice);
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
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      productSku: selectedProduct.sku,
      availableStock: selectedProduct.availableStock,
      priceListId: selectedPriceListId,
      priceListName: priceList?.name ?? '',
      unitPrice,
      quantity
    };

    if (editingIndex !== null) {
      setItems((prev) => prev.map((item, i) => (i === editingIndex ? newItem : item)));
      setEditingIndex(null);
    } else {
      const existingIndex = items.findIndex((i) => i.productId === selectedProduct.id);
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

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const addressLocked = orderShipping.carrierIsExternal;
  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);
  const addressChanged =
    !addressLocked &&
    selectedAddress !== undefined &&
    !isOrderAddress(selectedAddress, orderShipping.address);
  // El costo depende de la zona (CP): solo se recotiza si cambia el CP de un pedido con carrier
  const quoteCarrierId =
    addressChanged &&
    orderShipping.carrierId &&
    selectedAddress?.postcode !== orderShipping.address?.postcode
      ? orderShipping.carrierId
      : null;
  const quotePostcode = quoteCarrierId ? selectedAddress?.postcode : undefined;

  useEffect(() => {
    setShippingCostMode(null);
    if (!quoteCarrierId || !quotePostcode) {
      setShippingQuote({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setShippingQuote({ status: 'loading' });
    const timer = setTimeout(() => {
      quoteShipping({ postalCode: quotePostcode, cartTotal: subtotal })
        .then((res) => {
          if (cancelled) return;
          const quote = res.data?.find((q) => q.carrierId === quoteCarrierId);
          setShippingQuote(
            quote
              ? { status: 'ok', cost: quote.price }
              : {
                  status: 'unavailable',
                  message: 'El transportista del pedido no tiene tarifa para la nueva dirección.'
                }
          );
        })
        .catch((error) => {
          if (cancelled) return;
          setShippingQuote({
            status: 'unavailable',
            message: error instanceof Error ? error.message : 'No se pudo cotizar el envío.'
          });
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [quoteCarrierId, quotePostcode, subtotal]);

  const quotedCost = shippingQuote.status === 'ok' ? shippingQuote.cost : null;
  const costDiffers = quotedCost !== null && quotedCost !== orderShipping.cost;
  // El admin elige explícitamente si se mantiene el costo o el cliente paga la diferencia
  const needsCostChoice = costDiffers && shippingCostMode === null;
  const effectiveShippingCost =
    costDiffers && shippingCostMode === 'recalculate' && quotedCost !== null
      ? quotedCost
      : orderShipping.cost;

  const handleAddressSaved = (saved: Address) => {
    setAddresses((prev) =>
      prev.some((a) => a.id === saved.id)
        ? prev.map((a) => (a.id === saved.id ? saved : a))
        : [...prev, saved]
    );
    setSelectedAddressId(saved.id);
    setAddressFormTarget(null);
  };

  const handleSubmit = useCallback(async () => {
    if (!selectedAddressId && !orderShipping.address) {
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
        // Sin cambios se conserva el snapshot del pedido
        shippingAddressId: addressChanged ? selectedAddressId : undefined,
        shippingCostMode:
          costDiffers && shippingCostMode === 'recalculate' ? 'recalculate' : 'keep',
        items: items.map((i) => ({
          productId: i.productId,
          priceListId: i.priceListId,
          quantity: i.quantity
        }))
      });
      toast.success('Pedido actualizado correctamente');
      router.push(`/admin/pedidos/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar pedido');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    id,
    selectedAddressId,
    orderShipping.address,
    addressChanged,
    costDiffers,
    shippingCostMode,
    items,
    router
  ]);

  if (authLoading || !user) return null;

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

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Dirección de entrega
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {addressLocked ? (
            <div className="space-y-2">
              <p className="text-sm">
                {orderShipping.address
                  ? formatAddressLine(orderShipping.address)
                  : 'Sin información de dirección'}
              </p>
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  El envío lo gestiona {orderShipping.carrierName ?? 'un proveedor externo'}: la
                  dirección de entrega no se puede modificar.
                </AlertDescription>
              </Alert>
            </div>
          ) : isLoadingAddresses ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando direcciones...
            </div>
          ) : (
            <>
              {addresses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {orderShipping.address
                    ? `${formatAddressLine(orderShipping.address)}. El cliente no tiene direcciones guardadas: agregá una para cambiarla.`
                    : 'Este usuario no tiene direcciones registradas. Agregá una para el pedido.'}
                </p>
              ) : (
                <div className="space-y-2">
                  <Select
                    value={selectedAddressId}
                    onValueChange={setSelectedAddressId}
                    disabled={addressFormTarget !== null}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccioná una dirección" />
                    </SelectTrigger>
                    <SelectContent>
                      {addresses.map((addr) => (
                        <SelectItem key={addr.id} value={addr.id}>
                          {addr.street} {addr.streetNumber}
                          {addr.floor ? `, Piso ${addr.floor}` : ''}
                          {addr.apartment ? ` ${addr.apartment}` : ''} — {addr.city} (
                          {addr.postcode}){addr.isDeliverable === false ? ' · sin cobertura' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedAddress && (
                    <p className="text-xs text-muted-foreground">
                      {formatAddressLine(selectedAddress)}
                    </p>
                  )}
                  {!selectedAddress && orderShipping.address && (
                    <p className="text-xs text-muted-foreground">
                      Actual: {formatAddressLine(orderShipping.address)}
                    </p>
                  )}
                </div>
              )}

              {selectedAddress?.isDeliverable === false && (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Ninguna zona de envío cubre el código postal {selectedAddress.postcode}. Podés
                    guardar el pedido igual si la entrega la coordinás por tu cuenta.
                  </AlertDescription>
                </Alert>
              )}

              {addressFormTarget ? (
                <AdminAddressForm
                  key={addressFormTarget === 'new' ? 'new' : addressFormTarget.id}
                  userId={orderUserId}
                  address={addressFormTarget === 'new' ? undefined : addressFormTarget}
                  isFirst={addresses.length === 0}
                  onSaved={handleAddressSaved}
                  onCancel={() => setAddressFormTarget(null)}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAddressFormTarget('new')}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Nueva dirección
                  </Button>
                  {selectedAddress && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setAddressFormTarget(selectedAddress)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Editar dirección
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Shipping cost when the address changes */}
      {quoteCarrierId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4" />
              Costo de envío
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {shippingQuote.status === 'loading' && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cotizando {orderShipping.carrierName ?? 'envío'} para la nueva dirección...
              </div>
            )}
            {shippingQuote.status === 'unavailable' && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No se puede cotizar el envío</AlertTitle>
                <AlertDescription>
                  {shippingQuote.message} Se mantiene el costo actual de{' '}
                  {formatCurrency(orderShipping.cost)}.
                </AlertDescription>
              </Alert>
            )}
            {shippingQuote.status === 'ok' && !costDiffers && (
              <p className="text-muted-foreground">
                El costo de envío con {orderShipping.carrierName ?? 'el transportista'} no cambia (
                {formatCurrency(orderShipping.cost)}).
              </p>
            )}
            {shippingQuote.status === 'ok' && costDiffers && (
              <>
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>El costo de envío cambia con la nueva dirección</AlertTitle>
                  <AlertDescription>
                    Costo actual {formatCurrency(orderShipping.cost)} · Nuevo costo{' '}
                    {formatCurrency(shippingQuote.cost)} · Diferencia{' '}
                    {shippingQuote.cost > orderShipping.cost ? '+' : '−'}
                    {formatCurrency(Math.abs(shippingQuote.cost - orderShipping.cost))}
                  </AlertDescription>
                </Alert>
                <RadioGroup
                  value={shippingCostMode ?? ''}
                  onValueChange={(value) => setShippingCostMode(value as ShippingCostMode)}
                  className="gap-3"
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="keep" id="shipping-cost-keep" className="mt-0.5" />
                    <Label htmlFor="shipping-cost-keep" className="font-normal cursor-pointer">
                      Mantener el costo actual ({formatCurrency(orderShipping.cost)})
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem
                      value="recalculate"
                      id="shipping-cost-recalculate"
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="shipping-cost-recalculate"
                      className="font-normal cursor-pointer"
                    >
                      Aplicar el nuevo costo ({formatCurrency(shippingQuote.cost)}):{' '}
                      {shippingQuote.cost > orderShipping.cost
                        ? 'el cliente paga la diferencia'
                        : 'la diferencia queda a favor del cliente'}
                    </Label>
                  </div>
                </RadioGroup>
              </>
            )}
          </CardContent>
        </Card>
      )}

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
                        SKU: {p.sku} | Stock disponible: {p.availableStock}
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
                    <span className="font-semibold">{selectedProduct.availableStock}</span>
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
                          <div className="font-medium text-sm">{item.productName}</div>
                          <div className="text-xs text-muted-foreground">{item.productSku}</div>
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(item.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {formatCurrency(item.unitPrice * item.quantity)}
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
                              aria-label={`Editar ${item.productName}`}
                              onClick={() => handleEditItem(i)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              aria-label={`Eliminar ${item.productName}`}
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
              <div className="ml-auto max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Envío:</span>
                  <span>{formatCurrency(effectiveShippingCost)}</span>
                </div>
                <div className="flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-bold text-base">
                    {formatCurrency(subtotal + effectiveShippingCost)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          {needsCostChoice && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Elegí qué hacer con el costo de envío para guardar.
            </p>
          )}
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
              disabled={
                isSubmitting ||
                items.length === 0 ||
                (!selectedAddressId && !orderShipping.address) ||
                addressFormTarget !== null ||
                shippingQuote.status === 'loading' ||
                needsCostChoice
              }
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
