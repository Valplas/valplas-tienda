/**
 * Address Step Component
 * Step 1: Selección / alta / edición de la dirección de envío.
 * Persiste contra la API (createAddress / updateAddress) y entrega al
 * siguiente paso una Address con id real (UUID), requerido por la orden.
 */

'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { addressSchema, AddressFormData, ARGENTINA_PROVINCES } from '@/lib/validations/checkout';
import {
  createAddress,
  updateAddress,
  type Address,
  type CreateAddressInput
} from '@/lib/services/addresses.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

interface AddressStepProps {
  savedAddresses?: Address[];
  /** Recibe siempre una Address persistida (con id real). */
  onNext: (address: Address) => void;
  /** Se notifica al crear/editar para refrescar la lista en el padre. */
  onAddressSaved?: (address: Address) => void;
  onBack?: () => void;
}

type Mode = 'list' | 'form';

function formToInput(data: AddressFormData): CreateAddressInput {
  return {
    alias: data.label,
    street: data.street,
    streetNumber: data.streetNumber,
    floor: data.floor || undefined,
    apartment: data.apartment || undefined,
    city: data.city,
    province: data.province,
    postcode: data.postcode
  };
}

export function AddressStep({
  savedAddresses = [],
  onNext,
  onAddressSaved,
  onBack
}: AddressStepProps) {
  const [mode, setMode] = useState<Mode>(savedAddresses.length === 0 ? 'form' : 'list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    savedAddresses.length > 0 ? savedAddresses[0].id : null
  );
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors }
  } = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema)
  });

  const openNewForm = () => {
    setEditingId(null);
    reset({
      label: '',
      street: '',
      streetNumber: '',
      floor: '',
      apartment: '',
      city: '',
      province: undefined,
      postcode: ''
    });
    setMode('form');
  };

  const openEditForm = (address: Address) => {
    setEditingId(address.id);
    reset({
      label: address.alias,
      street: address.street,
      streetNumber: address.streetNumber,
      floor: address.floor ?? '',
      apartment: address.apartment ?? '',
      city: address.city,
      province: address.province as AddressFormData['province'],
      postcode: address.postcode
    });
    setMode('form');
  };

  const onSubmitForm = async (data: AddressFormData) => {
    setSaving(true);
    try {
      const input = formToInput(data);
      const saved = editingId ? await updateAddress(editingId, input) : await createAddress(input);
      onAddressSaved?.(saved);
      toast.success(editingId ? 'Dirección actualizada' : 'Dirección guardada');
      onNext(saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar la dirección');
    } finally {
      setSaving(false);
    }
  };

  const handleContinueWithSaved = () => {
    const selected = savedAddresses.find((addr) => addr.id === selectedAddressId);
    if (selected) {
      onNext(selected);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Dirección de envío</h2>
        <p className="text-muted-foreground text-sm">
          Seleccioná una dirección guardada o ingresá una nueva
        </p>
      </div>

      {/* Lista de direcciones guardadas */}
      {mode === 'list' && (
        <div className="space-y-4">
          <RadioGroup value={selectedAddressId || ''}>
            {savedAddresses.map((address) => (
              <div key={address.id} className="flex items-start space-x-3">
                <RadioGroupItem
                  value={address.id}
                  id={address.id}
                  onClick={() => setSelectedAddressId(address.id)}
                  className="mt-4"
                />
                <Label htmlFor={address.id} className="flex-1 cursor-pointer">
                  <Card className="hover:border-primary transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{address.alias}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {address.street} {address.streetNumber}
                            {address.floor && `, Piso ${address.floor}`}
                            {address.apartment && ` Dpto ${address.apartment}`}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {address.city}, {address.province} (CP {address.postcode})
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            openEditForm(address);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Label>
              </div>
            ))}
          </RadioGroup>

          <Button type="button" variant="outline" onClick={openNewForm} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Agregar nueva dirección
          </Button>
        </div>
      )}

      {/* Formulario nueva / edición */}
      {mode === 'form' && (
        <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
          <div>
            <Label htmlFor="label">Nombre para la dirección *</Label>
            <Input
              id="label"
              placeholder="Ej: Casa, Trabajo, etc."
              {...register('label')}
              error={errors.label?.message}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="street">Calle *</Label>
              <Input
                id="street"
                placeholder="Av. Corrientes"
                {...register('street')}
                error={errors.street?.message}
              />
            </div>
            <div>
              <Label htmlFor="streetNumber">Número *</Label>
              <Input
                id="streetNumber"
                placeholder="1234"
                {...register('streetNumber')}
                error={errors.streetNumber?.message}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="floor">Piso</Label>
              <Input id="floor" placeholder="Opcional" {...register('floor')} />
            </div>
            <div>
              <Label htmlFor="apartment">Departamento</Label>
              <Input id="apartment" placeholder="Opcional" {...register('apartment')} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city">Ciudad *</Label>
              <Input
                id="city"
                placeholder="Buenos Aires"
                {...register('city')}
                error={errors.city?.message}
              />
            </div>
            <div>
              <Label htmlFor="province">Provincia *</Label>
              <Controller
                control={control}
                name="province"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="province">
                      <SelectValue placeholder="Seleccioná la provincia" />
                    </SelectTrigger>
                    <SelectContent>
                      {ARGENTINA_PROVINCES.map((prov) => (
                        <SelectItem key={prov} value={prov}>
                          {prov}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.province?.message && (
                <p className="text-sm text-destructive mt-1">{errors.province.message}</p>
              )}
            </div>
          </div>

          <div className="max-w-xs">
            <Label htmlFor="postcode">Código Postal *</Label>
            <Input
              id="postcode"
              placeholder="1414"
              maxLength={8}
              {...register('postcode')}
              error={errors.postcode?.message}
            />
          </div>

          <div className="flex gap-2 pt-2">
            {savedAddresses.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingId(null);
                  setMode('list');
                }}
                disabled={saving}
              >
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={saving} className="ml-auto">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {saving ? 'Guardando...' : editingId ? 'Guardar y continuar' : 'Guardar y continuar'}
            </Button>
          </div>
        </form>
      )}

      {/* Acciones (solo en modo lista; el form tiene su propio submit) */}
      {mode === 'list' && (
        <div className="flex justify-between pt-4">
          {onBack && (
            <Button type="button" variant="outline" onClick={onBack}>
              Volver
            </Button>
          )}
          <Button
            type="button"
            onClick={handleContinueWithSaved}
            disabled={!selectedAddressId}
            className="ml-auto"
          >
            Continuar
          </Button>
        </div>
      )}

      {mode === 'form' && onBack && savedAddresses.length === 0 && (
        <div className="flex justify-start">
          <Button type="button" variant="outline" onClick={onBack}>
            Volver
          </Button>
        </div>
      )}
    </div>
  );
}
