/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * Addresses Page
 * Manage user addresses with CRUD operations
 */

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { DeleteConfirmModal } from '@/components/ui/delete-confirm-modal';
import {
  getUserAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  type Address as ServiceAddress
} from '@/services';
import { Address } from '@/types';
import { addressSchema, AddressFormData } from '@/lib/validations/checkout';
import { MapPin, Plus, Edit, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';

const ARGENTINA_PROVINCES = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán'
];

// Map service address (alias) to frontend address (label)
function mapServiceToFrontendAddress(serviceAddress: ServiceAddress): Address {
  return {
    ...serviceAddress,
    label: serviceAddress.alias
  } as any;
}

export default function AddressesPage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [deletingAddress, setDeletingAddress] = useState<Address | null>(null);

  const fetchAddresses = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const response = await getUserAddresses();

      if (response.success && response.data) {
        setAddresses(response.data.map(mapServiceToFrontendAddress));
      }
    } catch (error) {
      console.error('Error fetching addresses:', error);
      toast.error('Error al cargar las direcciones');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchAddresses();
  }, [user, fetchAddresses]);

  const handleAddNew = () => {
    setEditingAddress(null);
    setIsSheetOpen(true);
  };

  const handleEdit = (address: Address) => {
    setEditingAddress(address);
    setIsSheetOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingAddress) return;

    try {
      await deleteAddress(deletingAddress.id);
      toast.success('Dirección eliminada correctamente');
      setAddresses(addresses.filter((a) => a.id !== deletingAddress.id));
      setDeletingAddress(null);
    } catch (error: any) {
      console.error('Error deleting address:', error);
      toast.error(error?.message || 'Error al eliminar la dirección');
    }
  };

  const handleSetDefault = async (addressId: string) => {
    try {
      await setDefaultAddress(addressId);
      toast.success('Dirección predeterminada actualizada');
      await fetchAddresses();
    } catch (error: any) {
      console.error('Error setting default address:', error);
      toast.error(error?.message || 'Error al actualizar la dirección predeterminada');
    }
  };

  const handleSheetClose = () => {
    setIsSheetOpen(false);
    setEditingAddress(null);
  };

  if (authLoading || !user) return null;

  if (isLoading) {
    return <AddressesSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mis Direcciones</h1>
          <p className="mt-2 text-muted-foreground">Administrá tus direcciones de envío</p>
        </div>

        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button onClick={handleAddNew}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Dirección
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingAddress ? 'Editar Dirección' : 'Nueva Dirección'}</SheetTitle>
              <SheetDescription>
                {editingAddress
                  ? 'Modificá los datos de tu dirección'
                  : 'Agregá una nueva dirección de envío'}
              </SheetDescription>
            </SheetHeader>
            <AddressForm
              address={editingAddress}
              onSuccess={() => {
                fetchAddresses();
                handleSheetClose();
              }}
              onCancel={handleSheetClose}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Addresses Grid */}
      {addresses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MapPin className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No tenés direcciones guardadas</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Agregá una dirección para facilitar tus compras futuras
            </p>
            <Button onClick={handleAddNew}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar Primera Dirección
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {addresses.map((address) => (
            <Card key={address.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{address.label}</CardTitle>
                    {address.isDefault && (
                      <Badge variant="default" className="gap-1">
                        <Star className="h-3 w-3 fill-current" />
                        Predeterminada
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm">
                  <p>
                    {address.street} {address.streetNumber}
                  </p>
                  {(address.floor || address.apartment) && (
                    <p>
                      {address.floor && `Piso ${address.floor}`}
                      {address.floor && address.apartment && ', '}
                      {address.apartment && `Depto ${address.apartment}`}
                    </p>
                  )}
                  <p>
                    {address.city}, {address.province}
                  </p>
                  <p className="text-muted-foreground">CP: {address.postcode}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!address.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(address.id)}
                    >
                      <Star className="mr-1 h-3 w-3" />
                      Predeterminada
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleEdit(address)}>
                    <Edit className="mr-1 h-3 w-3" />
                    Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeletingAddress(address)}>
                    <Trash2 className="mr-1 h-3 w-3" />
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={!!deletingAddress}
        onOpenChange={(open) => !open && setDeletingAddress(null)}
        onConfirm={handleDelete}
        items={deletingAddress ? [{ id: deletingAddress.id, name: deletingAddress.label }] : []}
        itemType="dirección"
      />
    </div>
  );
}

interface AddressFormProps {
  address: Address | null;
  onSuccess: () => void;
  onCancel: () => void;
}

function AddressForm({ address, onSuccess, onCancel }: AddressFormProps) {
  const { user } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: address?.label || '',
      street: address?.street || '',
      streetNumber: address?.streetNumber || '',
      floor: address?.floor || '',
      apartment: address?.apartment || '',
      city: address?.city || '',
      province: address?.province || '',
      postcode: address?.postcode || '',
      latitude: address?.latitude,
      longitude: address?.longitude,
      placeId: address?.placeId
    }
  });

  const onSubmit = async (data: AddressFormData) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      // Map label to alias for API
      const addressData = {
        ...data,
        alias: data.label,
        isDefault: false
      };
      delete (addressData as any).label;

      if (address) {
        await updateAddress(address.id, addressData);
      } else {
        await createAddress(addressData);
      }

      toast.success(
        address ? 'Dirección actualizada correctamente' : 'Dirección agregada correctamente'
      );
      onSuccess();
    } catch (error: any) {
      console.error('Error saving address:', error);
      toast.error(error?.message || 'Error al guardar la dirección');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de la Dirección</FormLabel>
              <FormControl>
                <Input placeholder="Casa, Trabajo, etc." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="street"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Calle</FormLabel>
                <FormControl>
                  <Input placeholder="Av. Corrientes" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="streetNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número</FormLabel>
                <FormControl>
                  <Input placeholder="1234" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="floor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Piso (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="5" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="apartment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Depto (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="A" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ciudad</FormLabel>
                <FormControl>
                  <Input placeholder="Buenos Aires" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="province"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Provincia</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccioná una provincia" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ARGENTINA_PROVINCES.map((province) => (
                      <SelectItem key={province} value={province}>
                        {province}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="postcode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Código Postal</FormLabel>
                <FormControl>
                  <Input placeholder="1234" maxLength={4} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting} className="flex-1">
            {isSubmitting ? 'Guardando...' : address ? 'Actualizar' : 'Agregar'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function AddressesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="mt-2 h-5 w-64" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
