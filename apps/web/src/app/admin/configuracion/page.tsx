'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole, type StoreInfo, type StoreSettings } from '@/types';
import { getAdminStoreSettings, getStoreInfo } from '@/lib/services/settings.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoUploader } from '@/components/admin/settings/logo-uploader';
import { StoreInfoForm } from '@/components/admin/settings/store-info-form';

export default function ConfiguracionPage() {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);

  useEffect(() => {
    let active = true;
    getAdminStoreSettings()
      .then((data) => {
        if (active) setSettings(data);
      })
      .catch((error) => {
        if (active) {
          toast.error(error instanceof Error ? error.message : 'Error al cargar la configuración');
        }
      });
    getStoreInfo()
      .then((data) => {
        if (active) setStoreInfo(data);
      })
      .catch((error) => {
        if (active) {
          toast.error(
            error instanceof Error ? error.message : 'Error al cargar la información del negocio'
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (authLoading || !user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">Apariencia e información de la tienda</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Logo de la tienda</CardTitle>
          <CardDescription>Aparece arriba a la izquierda en todas las páginas.</CardDescription>
        </CardHeader>
        <CardContent>
          {settings ? (
            <LogoUploader settings={settings} onChange={setSettings} />
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Información del negocio</CardTitle>
          <CardDescription>
            Horarios, entregas, medios de pago y contacto. Se usa en la tienda y en el bot de
            WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {storeInfo ? (
            <StoreInfoForm storeInfo={storeInfo} onChange={setStoreInfo} />
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
