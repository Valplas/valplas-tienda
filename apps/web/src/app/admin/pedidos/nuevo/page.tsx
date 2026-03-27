'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole } from '@/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { toast } from 'sonner';
import {
  ArrowLeft,
  Search,
  Trash2,
  Plus,
  Loader2,
  User,
  MapPin,
  Package,
  Pencil
} from 'lucide-react';
import { getAdminUsers } from '@/lib/services/users.service';
import { getAdminProducts } from '@/lib/services/products.service';
import { getPriceLists, calculatePrice } from '@/lib/services/price-lists.service';
import { adminCreateOrder } from '@/lib/services/orders.service';
import { formatCurrency } from '@/lib/utils';
import type { AdminUser, AdminUserWithAddresses } from '@/lib/services/users.service';
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

type EmbeddedAddress = AdminUserWithAddresses['addresses'][number];

interface UserAddressRow {
  user: AdminUserWithAddresses;
  address: EmbeddedAddress | null;
  allAddresses: EmbeddedAddress[];
}

export default function NuevoPedidoPage() {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });
  const router = useRouter();

  // User search
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<UserAddressRow[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Address
  const [addresses, setAddresses] = useState<EmbeddedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');

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
  const [notes, setNotes] = useState('');

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load price lists on mount
  useEffect(() => {
    getPriceLists({ isActive: true, limit: 100 }).then((res) => {
      if (res.success && res.data) {
        setPriceLists(res.data.priceLists);
      }
    });
  }, []);

  // Search users with debounce (min 3 chars) — addresses included via JOIN, no N+1
  const searchUsers = useCallback(async (search: string) => {
    if (search.trim().length < 3) {
      setUserResults([]);
      return;
    }
    setIsSearchingUsers(true);
    try {
      const { users: rawUsers } = await getAdminUsers({
        search,
        limit: 20,
        includeAddresses: true
      });
      const users = rawUsers as AdminUserWithAddresses[];
      const rows: UserAddressRow[] = [];
      users.forEach((u) => {
        if (u.addresses.length === 0) {
          rows.push({ user: u, address: null, allAddresses: [] });
        } else {
          u.addresses.forEach((addr) =>
            rows.push({ user: u, address: addr, allAddresses: u.addresses })
          );
        }
      });
      setUserResults(rows);
    } finally {
      setIsSearchingUsers(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchUsers(userSearch), 400);
    return () => clearTimeout(timer);
  }, [userSearch, searchUsers]);

  // Select user+address row (addresses already fetched during search)
  const handleSelectUserAddress = useCallback((row: UserAddressRow) => {
    setSelectedUser(row.user);
    setUserResults([]);
    setUserSearch('');
    setAddresses(row.allAddresses);
    if (row.address) {
      setSelectedAddressId(row.address.id);
    } else if (row.allAddresses.length === 1) {
      setSelectedAddressId(row.allAddresses[0].id);
    } else {
      setSelectedAddressId('');
    }
  }, []);

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
    setIsCalculatingPrice(true);
    calculatePrice(selectedPriceListId, selectedProduct.id)
      .then((res) => {
        if (res.success && res.data) {
          setUnitPrice(res.data.unitPrice);
        }
      })
      .catch(() => setUnitPrice(0))
      .finally(() => setIsCalculatingPrice(false));
  }, [selectedProduct?.id, selectedPriceListId]);

  const handleSelectProduct = useCallback((product: ProductSearchResult) => {
    setSelectedProduct(product);
    setProductSearch('');
    setProductResults([]);
    setSelectedPriceListId('');
    setUnitPrice(0);
    setQuantity(1);
  }, []);

  // Load an existing item back into the form for editing
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
    if (!selectedProduct || !selectedPriceListId || unitPrice <= 0) {
      toast.error('Seleccioná un producto y una lista de precios');
      return;
    }
    if (quantity < 1 || quantity > selectedProduct.available_stock) {
      toast.error(`Cantidad inválida. Stock disponible: ${selectedProduct.available_stock}`);
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
      // Replace the item being edited
      setItems((prev) => prev.map((item, i) => (i === editingIndex ? newItem : item)));
      setEditingIndex(null);
    } else {
      const existingIndex = items.findIndex((i) => i.product_id === selectedProduct.id);
      if (existingIndex >= 0) {
        const newQty = items[existingIndex].quantity + quantity;
        if (newQty > selectedProduct.available_stock) {
          toast.error(`Stock insuficiente. Disponible: ${selectedProduct.available_stock}`);
          return;
        }
        setItems((prev) =>
          prev.map((item, i) => (i === existingIndex ? { ...item, quantity: newQty } : item))
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
        // Cancel edit if removing the item being edited
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
    if (!selectedUser) {
      toast.error('Seleccioná un cliente');
      return;
    }
    if (items.length === 0) {
      toast.error('Agregá al menos un producto');
      return;
    }

    setIsSubmitting(true);
    try {
      const order = await adminCreateOrder({
        user_id: selectedUser.id,
        shipping_address_id: selectedAddressId || undefined,
        items: items.map((i) => ({
          product_id: i.product_id,
          price_list_id: i.price_list_id,
          quantity: i.quantity
        })),
        notes: notes || undefined,
        payment_method: 'manual'
      });
      toast.success('Pedido creado correctamente');
      router.push(`/admin/pedidos/${order.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear pedido';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedUser, selectedAddressId, items, notes, router]);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  if (authLoading || !user) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/pedidos">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Nueva Orden</h1>
          <p className="text-muted-foreground mt-1">Creá un pedido manual para un cliente</p>
        </div>
      </div>

      {/* Step 1: Client */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            1. Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedUser ? (
            <div className="flex items-center justify-between bg-muted rounded-lg p-3">
              <div>
                <div className="font-medium">
                  {selectedUser.first_name} {selectedUser.last_name}
                </div>

                <div className="text-sm text-muted-foreground">{selectedUser.phone}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedUser(null);
                  setAddresses([]);
                  setSelectedAddressId('');
                  setItems([]);
                }}
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, apellido, email, teléfono o número de usuario..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9"
                />
                {isSearchingUsers && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {userResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {userResults.map((row, idx) => (
                    <button
                      key={`${row.user.id}-${row.address?.id ?? idx}`}
                      className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b last:border-0"
                      onClick={() => handleSelectUserAddress(row)}
                    >
                      <div className="font-medium">
                        {row.user.first_name} {row.user.last_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {row.user.phone ?? row.user.email}
                      </div>
                      {row.address ? (
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {row.address.street} {row.address.street_number}
                          {row.address.floor ? `, Piso ${row.address.floor}` : ''}
                          {row.address.apartment ? ` ${row.address.apartment}` : ''} —{' '}
                          {row.address.city}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground italic mt-0.5">
                          Sin dirección registrada
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Address */}
      {selectedUser && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              2. Dirección de entrega
            </CardTitle>
          </CardHeader>
          <CardContent>
            {addresses.length === 0 ? (
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
      )}

      {/* Step 3: Products */}
      {selectedUser && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              3. Productos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Product search */}
            <div className="space-y-3">
              <Label>Buscar producto</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nombre, SKU, código, descripción..."
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
                        <SelectContent className="w-(--radix-select-trigger-width) max-h-48 overflow-y-auto">
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
                        max={selectedProduct.available_stock}
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
                    <Button
                      className="flex-1"
                      onClick={handleAddItem}
                      disabled={!selectedPriceListId || unitPrice <= 0}
                    >
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
                        <TableHead className="hidden sm:table-cell">Lista</TableHead>
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
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                            {item.price_list_name}
                          </TableCell>
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
                                onClick={() => handleEditItem(i)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
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
      )}

      {/* Notes + Submit */}
      {selectedUser && items.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-1">
              <Label>Notas (opcional)</Label>
              <Textarea
                placeholder="Notas para el pedido..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Summary */}
            <div className="bg-muted rounded-lg p-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-medium">
                  {selectedUser.first_name} {selectedUser.last_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dirección:</span>
                <span>
                  {selectedAddress
                    ? `${selectedAddress.street} ${selectedAddress.street_number}, ${selectedAddress.city}`
                    : 'Sin dirección'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Productos:</span>
                <span>{items.length} ítem(s)</span>
              </div>
              <div className="flex justify-between font-semibold text-base pt-1 border-t">
                <span>Total:</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => router.push('/admin/pedidos')}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar Pedido'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
