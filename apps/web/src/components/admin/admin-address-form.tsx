'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { toast } from 'sonner';
import { ARGENTINA_PROVINCES } from '@/lib/validations/checkout';
import {
  type Address,
  adminCreateUserAddress,
  updateAddress
} from '@/lib/services/addresses.service';

const SHIPPING_ADMIN_PATH = '/admin/envios';

export function openShippingAdmin() {
  window.open(SHIPPING_ADMIN_PATH, '_blank', 'noopener');
}

/**
 * La dirección se guarda aunque ninguna zona de envío cubra su CP: el admin
 * tiene que poder cargar la dirección real del cliente. Solo se avisa.
 */
export function notifyAddressSaved(address: Address, isEdit: boolean) {
  const title = isEdit ? 'Dirección actualizada' : 'Dirección guardada';
  if (address.isDeliverable === false) {
    toast.warning(title, {
      description: `Por el momento no realizamos entregas al código postal ${address.postcode}.`,
      action: { label: 'Ver zonas', onClick: openShippingAdmin }
    });
  } else {
    toast.success(title);
  }
}

interface AddressFormState {
  alias: string;
  street: string;
  streetNumber: string;
  floor: string;
  apartment: string;
  city: string;
  province: string;
  postcode: string;
  notes: string;
}

type FormErrors = Partial<Record<keyof AddressFormState, string>>;

const PROVINCES: readonly string[] = ARGENTINA_PROVINCES;

function toFormState(address?: Address): AddressFormState {
  return {
    alias: address?.alias ?? '',
    street: address?.street ?? '',
    streetNumber: address?.streetNumber ?? '',
    floor: address?.floor ?? '',
    apartment: address?.apartment ?? '',
    city: address?.city ?? '',
    // Direcciones viejas pueden tener una provincia fuera del enum del backend: obligar a elegir
    province: address && PROVINCES.includes(address.province) ? address.province : '',
    postcode: address?.postcode ?? '',
    notes: address?.notes ?? ''
  };
}

interface AdminAddressFormProps {
  userId: string;
  /** Dirección a editar; sin ella el form crea una nueva */
  address?: Address;
  /** La primera dirección del usuario queda como predeterminada */
  isFirst?: boolean;
  onSaved: (address: Address) => void;
  onCancel: () => void;
}

export function AdminAddressForm({
  userId,
  address,
  isFirst = false,
  onSaved,
  onCancel
}: AdminAddressFormProps) {
  const [form, setForm] = useState<AddressFormState>(() => toFormState(address));
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const isEdit = Boolean(address);
  const idPrefix = address ? `addr-${address.id}` : 'addr-new';

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (form.alias.trim().length < 2) newErrors.alias = 'Mínimo 2 caracteres';
    if (form.street.trim().length < 2) newErrors.street = 'Mínimo 2 caracteres';
    if (!form.streetNumber.trim()) newErrors.streetNumber = 'Requerido';
    if (form.city.trim().length < 2) newErrors.city = 'Mínimo 2 caracteres';
    if (!form.province) newErrors.province = 'Requerido';
    if (!/^\d{4,8}$/.test(form.postcode.trim())) newErrors.postcode = 'Entre 4 y 8 dígitos';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      alias: form.alias.trim(),
      street: form.street.trim(),
      streetNumber: form.streetNumber.trim(),
      city: form.city.trim(),
      province: form.province,
      postcode: form.postcode.trim()
    };

    setIsSaving(true);
    try {
      const saved = address
        ? await updateAddress(address.id, {
            ...payload,
            // Vacío limpia el campo al editar
            floor: form.floor.trim(),
            apartment: form.apartment.trim(),
            notes: form.notes.trim()
          })
        : await adminCreateUserAddress(userId, {
            ...payload,
            floor: form.floor.trim() || undefined,
            apartment: form.apartment.trim() || undefined,
            notes: form.notes.trim() || undefined,
            isDefault: isFirst
          });
      notifyAddressSaved(saved, isEdit);
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar dirección');
    } finally {
      setIsSaving(false);
    }
  };

  const field = (key: keyof AddressFormState) => ({
    id: `${idPrefix}-${key}`,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
  });

  const fieldError = (key: keyof AddressFormState) =>
    errors[key] ? <p className="text-xs text-red-500">{errors[key]}</p> : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 border rounded-lg bg-muted/20">
      <p className="text-sm font-medium">{isEdit ? 'Editar dirección' : 'Nueva dirección'}</p>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-alias`} className="text-xs">
          Alias *
        </Label>
        <Input placeholder="Casa, Oficina..." className="h-8 text-sm" {...field('alias')} />
        {fieldError('alias')}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 space-y-1">
          <Label htmlFor={`${idPrefix}-street`} className="text-xs">
            Calle *
          </Label>
          <Input placeholder="Av. Corrientes" className="h-8 text-sm" {...field('street')} />
          {fieldError('street')}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-streetNumber`} className="text-xs">
            Número *
          </Label>
          <Input placeholder="1234" className="h-8 text-sm" {...field('streetNumber')} />
          {fieldError('streetNumber')}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-floor`} className="text-xs">
            Piso
          </Label>
          <Input placeholder="3" className="h-8 text-sm" {...field('floor')} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-apartment`} className="text-xs">
            Depto
          </Label>
          <Input placeholder="B" className="h-8 text-sm" {...field('apartment')} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-city`} className="text-xs">
          Ciudad *
        </Label>
        <Input placeholder="Buenos Aires" className="h-8 text-sm" {...field('city')} />
        {fieldError('city')}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-province`} className="text-xs">
            Provincia *
          </Label>
          <Select
            value={form.province}
            onValueChange={(value) => setForm((prev) => ({ ...prev, province: value }))}
          >
            <SelectTrigger id={`${idPrefix}-province`} className="h-8 text-sm">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {ARGENTINA_PROVINCES.map((province) => (
                <SelectItem key={province} value={province}>
                  {province}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError('province')}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-postcode`} className="text-xs">
            Código postal *
          </Label>
          <Input
            placeholder="1043"
            inputMode="numeric"
            className="h-8 text-sm"
            {...field('postcode')}
          />
          {fieldError('postcode')}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-notes`} className="text-xs">
          Notas
        </Label>
        <Textarea
          id={`${idPrefix}-notes`}
          placeholder="Entre calles, color del negocio, horario de atención..."
          className="text-sm resize-none"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isSaving} className="flex-1">
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
          {isSaving ? 'Guardando...' : 'Guardar dirección'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
