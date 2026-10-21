'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GalleryHorizontal, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { UserRole, type AdminBanner } from '@/types';
import {
  createBanner,
  deleteBanner,
  getAdminBanners,
  reorderBanners,
  replaceBannerImages,
  updateBanner
} from '@/lib/services/banners.service';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DeleteConfirmModal } from '@/components/ui/delete-confirm-modal';
import { BannerList } from '@/components/admin/banners/banner-list';
import { BannerForm, type BannerFormSubmit } from '@/components/admin/banners/banner-form';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function BannersPage() {
  const { user, isLoading: authLoading } = useRequireAuth({
    allowedRoles: [UserRole.OWNER, UserRole.ADMIN]
  });
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedBanner, setSelectedBanner] = useState<AdminBanner | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminBanner | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadBanners = useCallback(async () => {
    try {
      const data = await getAdminBanners();
      if (isMountedRef.current) setBanners(data.banners);
    } catch (error) {
      if (isMountedRef.current) toast.error(errorMessage(error, 'Error al cargar banners'));
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  const openCreate = () => {
    setSelectedBanner(undefined);
    setSheetOpen(true);
  };

  const openEdit = (banner: AdminBanner) => {
    setSelectedBanner(banner);
    setSheetOpen(true);
  };

  const handleSubmit = async ({ payload, images }: BannerFormSubmit) => {
    setIsSubmitting(true);
    try {
      if (selectedBanner) {
        await updateBanner(selectedBanner.id, payload);
        if (images) await replaceBannerImages(selectedBanner.id, images);
        toast.success('Banner actualizado');
      } else {
        if (!images) return;
        await createBanner(payload, images);
        toast.success('Banner creado. Ya aparece al final de la lista.');
      }
      setSheetOpen(false);
      await loadBanners();
    } catch (error) {
      toast.error(errorMessage(error, 'Error al guardar el banner'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Optimista: se reordena en pantalla y se revierte si el server falla
  const handleReorder = async (bannerIds: string[]) => {
    const previous = banners;
    const byId = new Map(banners.map((banner) => [banner.id, banner]));
    setBanners(bannerIds.map((id) => byId.get(id)!));
    setReordering(true);
    try {
      await reorderBanners(bannerIds);
    } catch (error) {
      setBanners(previous);
      toast.error(errorMessage(error, 'No se pudo guardar el orden'));
    } finally {
      setReordering(false);
    }
  };

  const handleToggleActive = async (banner: AdminBanner, isActive: boolean) => {
    try {
      const updated = await updateBanner(banner.id, { is_active: isActive });
      setBanners((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.success(isActive ? 'Banner activado' : 'Banner apagado');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo cambiar el estado'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBanner(deleteTarget.id);
      setBanners((prev) => prev.filter((banner) => banner.id !== deleteTarget.id));
      toast.success('Banner eliminado');
    } catch (error) {
      toast.error(errorMessage(error, 'Error al eliminar el banner'));
      throw error; // mantiene abierto el modal
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Banners</h1>
          <p className="text-muted-foreground">
            Se muestran arriba de todo en la página de inicio, en este orden. Arrastralos o usá las
            flechas para cambiarlo.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo banner
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : banners.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <GalleryHorizontal className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Todavía no hay banners</p>
            <p className="text-sm text-muted-foreground">
              Mientras no haya ninguno activo, la página de inicio muestra el nombre de la tienda.
            </p>
          </div>
          <Button onClick={openCreate} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Crear el primero
          </Button>
        </div>
      ) : (
        <>
          <BannerList
            banners={banners}
            onReorder={handleReorder}
            onToggleActive={handleToggleActive}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            reordering={reordering}
          />
          {reordering && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando orden...
            </p>
          )}
        </>
      )}

      <Sheet open={sheetOpen} onOpenChange={(open) => !isSubmitting && setSheetOpen(open)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[600px]">
          <SheetHeader>
            <SheetTitle>{selectedBanner ? 'Editar banner' : 'Nuevo banner'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 px-1 pb-6">
            <BannerForm
              key={selectedBanner?.id ?? 'new'}
              banner={selectedBanner}
              onSubmit={handleSubmit}
              onCancel={() => setSheetOpen(false)}
              isLoading={isSubmitting}
            />
          </div>
        </SheetContent>
      </Sheet>

      <DeleteConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        items={deleteTarget ? [{ id: deleteTarget.id, name: deleteTarget.title }] : []}
        onConfirm={handleDelete}
        itemType="banner"
      />
    </div>
  );
}
