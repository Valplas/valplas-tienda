'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, MapPin, Star, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  type Address,
  type CreateAddressInput,
  getAdminUserAddresses,
  adminCreateUserAddress,
  deleteAddress
} from '@/lib/services/addresses.service';

interface UserAddressesSectionProps {
  userId: string;
  userName: string;
}

const EMPTY_FORM: CreateAddressInput = {
  alias: '',
  street: '',
  street_number: '',
  floor: '',
  apartment: '',
  city: '',
  province: '',
  postcode: '',
  notes: '',
  is_default: false
};

export function UserAddressesSection({ userId, userName }: UserAddressesSectionProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<CreateAddressInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateAddressInput, string>>>({});

  const loadAddresses = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAdminUserAddresses(userId);
      setAddresses(data);
    } catch {
      toast.error('Error al cargar direcciones');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof CreateAddressInput, string>> = {};
    if (!form.alias.trim()) newErrors.alias = 'Requerido';
    if (!form.street.trim()) newErrors.street = 'Requerido';
    if (!form.street_number.trim()) newErrors.street_number = 'Requerido';
    if (!form.city.trim()) newErrors.city = 'Requerido';
    if (!form.province.trim()) newErrors.province = 'Requerido';
    if (!form.postcode.trim()) newErrors.postcode = 'Requerido';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    try {
      await adminCreateUserAddress(userId, {
        ...form,
        floor: form.floor || undefined,
        apartment: form.apartment || undefined,
        notes: form.notes || undefined,
        is_default: addresses.length === 0 ? true : form.is_default
      });
      toast.success('Dirección agregada');
      setForm(EMPTY_FORM);
      setErrors({});
      setShowForm(false);
      await loadAddresses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar dirección');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAddress(id);
      toast.success('Dirección eliminada');
      await loadAddresses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar dirección');
    }
  };

  const field = (key: keyof CreateAddressInput) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
  });

  return (
    <div className="space-y-4">
      <Separator />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Direcciones de {userName}</span>
          {!isLoading && (
            <Badge variant="secondary" className="text-xs">
              {addresses.length}
            </Badge>
          )}
        </div>
        {!showForm && (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Agregar
          </Button>
        )}
      </div>

      {/* Existing addresses */}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : addresses.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground text-center py-2">
          Sin direcciones. Agregá una para poder crear pedidos.
        </p>
      ) : (
        <div className="space-y-2">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className="flex items-start justify-between p-3 rounded-lg border bg-muted/30 text-sm"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-medium">
                  {addr.alias}
                  {addr.is_default && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />}
                </div>
                <div className="text-muted-foreground">
                  {addr.street} {addr.street_number}
                  {addr.floor && `, Piso ${addr.floor}`}
                  {addr.apartment && ` ${addr.apartment}`}
                </div>
                <div className="text-muted-foreground">
                  {addr.city}, {addr.province} ({addr.postcode})
                </div>
                {addr.notes && <div className="text-muted-foreground italic">{addr.notes}</div>}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                aria-label={`Eliminar ${addr.alias}`}
                onClick={() => handleDelete(addr.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add address form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 p-4 border rounded-lg bg-muted/20">
          <p className="text-sm font-medium">Nueva dirección</p>

          <div className="space-y-1">
            <Label htmlFor="addr-alias" className="text-xs">
              Alias *
            </Label>
            <Input
              id="addr-alias"
              placeholder="Casa, Oficina..."
              className="h-8 text-sm"
              {...field('alias')}
            />
            {errors.alias && <p className="text-xs text-red-500">{errors.alias}</p>}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="addr-street" className="text-xs">
                Calle *
              </Label>
              <Input
                id="addr-street"
                placeholder="Av. Corrientes"
                className="h-8 text-sm"
                {...field('street')}
              />
              {errors.street && <p className="text-xs text-red-500">{errors.street}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="addr-number" className="text-xs">
                Número *
              </Label>
              <Input
                id="addr-number"
                placeholder="1234"
                className="h-8 text-sm"
                {...field('street_number')}
              />
              {errors.street_number && (
                <p className="text-xs text-red-500">{errors.street_number}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="addr-floor" className="text-xs">
                Piso
              </Label>
              <Input id="addr-floor" placeholder="3" className="h-8 text-sm" {...field('floor')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="addr-apt" className="text-xs">
                Depto
              </Label>
              <Input
                id="addr-apt"
                placeholder="B"
                className="h-8 text-sm"
                {...field('apartment')}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="addr-city" className="text-xs">
              Ciudad *
            </Label>
            <Input
              id="addr-city"
              placeholder="Buenos Aires"
              className="h-8 text-sm"
              {...field('city')}
            />
            {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="addr-province" className="text-xs">
                Provincia *
              </Label>
              <Input
                id="addr-province"
                placeholder="Buenos Aires"
                className="h-8 text-sm"
                {...field('province')}
              />
              {errors.province && <p className="text-xs text-red-500">{errors.province}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="addr-postcode" className="text-xs">
                Código postal *
              </Label>
              <Input
                id="addr-postcode"
                placeholder="1043"
                className="h-8 text-sm"
                {...field('postcode')}
              />
              {errors.postcode && <p className="text-xs text-red-500">{errors.postcode}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="addr-notes" className="text-xs">
              Notas
            </Label>
            <Textarea
              id="addr-notes"
              placeholder="Entre calles, color del negocio, horario de atención..."
              className="text-sm resize-none"
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={isSaving} className="flex-1">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Guardar dirección
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setErrors({});
                setForm(EMPTY_FORM);
              }}
              disabled={isSaving}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
