'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  MapPin,
  Star,
  Trash2,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { getShippingZonesAdmin } from '@/lib/services/shipping-admin.service';
import {
  type Address,
  getAdminUserAddresses,
  deleteAddress
} from '@/lib/services/addresses.service';
import { AdminAddressForm, openShippingAdmin } from '@/components/admin/admin-address-form';

interface UserAddressesSectionProps {
  userId: string;
  userName: string;
}

/** null = form cerrado, 'new' = alta, Address = edición */
type FormTarget = null | 'new' | Address;

export function UserAddressesSection({ userId, userName }: UserAddressesSectionProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  // null = todavía no se chequeó. Sin zonas activas la dirección se guarda pero no hay envíos web.
  const [zonesMissing, setZonesMissing] = useState<boolean | null>(null);

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

  const openForm = async (target: 'new' | Address) => {
    setFormTarget(target);
    try {
      const { total } = await getShippingZonesAdmin({ isActive: true, limit: 1 });
      setZonesMissing(total === 0);
    } catch {
      // Solo informativo: la dirección se guarda igual
    }
  };

  const handleSaved = async () => {
    setFormTarget(null);
    await loadAddresses();
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
        {!formTarget && (
          <Button type="button" size="sm" variant="outline" onClick={() => openForm('new')}>
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
      ) : addresses.length === 0 && !formTarget ? (
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
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {addr.alias}
                  {addr.isDefault && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />}
                  {addr.isDeliverable === false && <Badge variant="warning">Sin cobertura</Badge>}
                </div>
                <div className="text-muted-foreground">
                  {addr.street} {addr.streetNumber}
                  {addr.floor && `, Piso ${addr.floor}`}
                  {addr.apartment && ` ${addr.apartment}`}
                </div>
                <div className="text-muted-foreground">
                  {addr.city}, {addr.province} ({addr.postcode})
                </div>
                {addr.notes && <div className="text-muted-foreground italic">{addr.notes}</div>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={`Editar ${addr.alias}`}
                  disabled={formTarget !== null}
                  onClick={() => openForm(addr)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                  aria-label={`Eliminar ${addr.alias}`}
                  onClick={() => handleDelete(addr.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit address form */}
      {formTarget && (
        <div className="space-y-3">
          {zonesMissing && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No hay zonas de envío configuradas</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  La dirección se guarda igual, pero hasta que configures una zona activa no se
                  pueden hacer envíos web a ningún código postal.
                </p>
                <Button type="button" size="sm" variant="outline" onClick={openShippingAdmin}>
                  Configurar envíos
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <AdminAddressForm
            key={formTarget === 'new' ? 'new' : formTarget.id}
            userId={userId}
            address={formTarget === 'new' ? undefined : formTarget}
            isFirst={addresses.length === 0}
            onSaved={handleSaved}
            onCancel={() => setFormTarget(null)}
          />
        </div>
      )}
    </div>
  );
}
