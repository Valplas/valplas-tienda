/**
 * Address Step Component
 * Step 1: Shipping address selection/entry
 */

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addressSchema, AddressFormData } from '@/lib/validations/checkout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Address } from '@/types';

interface AddressStepProps {
  savedAddresses?: Address[];
  onNext: (address: Address | AddressFormData) => void;
  onBack?: () => void;
}

export function AddressStep({ savedAddresses = [], onNext, onBack }: AddressStepProps) {
  const [useNewAddress, setUseNewAddress] = useState(savedAddresses.length === 0);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    savedAddresses.length > 0 ? savedAddresses[0].id : null
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema)
  });

  const handleNext = () => {
    if (useNewAddress) {
      handleSubmit(onNext)();
    } else {
      const selectedAddress = savedAddresses.find((addr) => addr.id === selectedAddressId);
      if (selectedAddress) {
        onNext(selectedAddress);
      }
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

      {/* Saved Addresses */}
      {savedAddresses.length > 0 && (
        <div className="space-y-4">
          <RadioGroup value={useNewAddress ? 'new' : selectedAddressId || ''}>
            {savedAddresses.map((address) => (
              <div key={address.id} className="flex items-start space-x-3">
                <RadioGroupItem
                  value={address.id}
                  id={address.id}
                  onClick={() => {
                    setUseNewAddress(false);
                    setSelectedAddressId(address.id);
                  }}
                />
                <Label htmlFor={address.id} className="flex-1 cursor-pointer">
                  <Card className="hover:border-primary transition-colors">
                    <CardContent className="p-4">
                      <div className="font-medium">{address.label}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {address.street} {address.street_number}
                        {address.floor && `, Piso ${address.floor}`}
                        {address.apartment && ` Dpto ${address.apartment}`}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {address.city}, {address.province} (CP {address.postcode})
                      </div>
                    </CardContent>
                  </Card>
                </Label>
              </div>
            ))}

            {/* New Address Option */}
            <div className="flex items-start space-x-3">
              <RadioGroupItem
                value="new"
                id="new"
                onClick={() => {
                  setUseNewAddress(true);
                  setSelectedAddressId(null);
                }}
              />
              <Label htmlFor="new" className="flex-1 cursor-pointer font-medium">
                Usar una nueva dirección
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {/* New Address Form */}
      {useNewAddress && (
        <form onSubmit={handleSubmit(onNext)} className="space-y-4">
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
              <Label htmlFor="street_number">Número *</Label>
              <Input
                id="street_number"
                placeholder="1234"
                {...register('street_number')}
                error={errors.street_number?.message}
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
              <Input
                id="province"
                placeholder="CABA"
                {...register('province')}
                error={errors.province?.message}
              />
            </div>
          </div>

          <div className="max-w-xs">
            <Label htmlFor="postcode">Código Postal *</Label>
            <Input
              id="postcode"
              placeholder="1414"
              maxLength={4}
              {...register('postcode')}
              error={errors.postcode?.message}
            />
          </div>
        </form>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack}>
            Volver
          </Button>
        )}
        <Button
          type="button"
          onClick={handleNext}
          disabled={isSubmitting || (!useNewAddress && !selectedAddressId)}
          className="ml-auto"
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}
