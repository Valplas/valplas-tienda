/**
 * Banner tal como lo ve el público: solo imágenes y destino ya saneado (si el
 * producto/categoría/marca del link está inactivo o borrado, llega null).
 * Destino: linkProductSlug → ficha del producto; si no, catálogo filtrado por
 * linkCategoryId y/o linkBrandId; ninguno → sin link.
 */
export interface PublicBanner {
  id: string;
  title: string;
  desktopImageUrl: string;
  desktopWidth: number;
  desktopHeight: number;
  mobileImageUrl: string | null;
  mobileWidth: number | null;
  mobileHeight: number | null;
  linkProductSlug: string | null;
  linkCategoryId: string | null;
  linkBrandId: string | null;
}

/** Banner para el backoffice: incluye inactivos, vigencia y nombres del destino. */
export interface AdminBanner {
  id: string;
  title: string;
  desktopImageUrl: string;
  desktopWidth: number;
  desktopHeight: number;
  mobileImageUrl: string | null;
  mobileWidth: number | null;
  mobileHeight: number | null;
  linkCategoryId: string | null;
  linkCategoryName: string | null;
  linkCategoryIsActive: boolean | null;
  linkBrandId: string | null;
  linkBrandName: string | null;
  linkBrandIsActive: boolean | null;
  linkProductId: string | null;
  linkProductName: string | null;
  linkProductSlug: string | null;
  linkProductIsActive: boolean | null;
  displayOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BannerImageData {
  url: string;
  storagePath: string;
  width: number;
  height: number;
}

export interface BannerStorage {
  desktopStoragePath: string;
  mobileStoragePath: string | null;
}

export interface BannerLinkTargets {
  linkCategoryId: string | null;
  linkBrandId: string | null;
  linkProductId: string | null;
}

export interface NewBanner extends BannerLinkTargets {
  id: string;
  title: string;
  desktop: BannerImageData;
  mobile: BannerImageData | null;
  displayOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string;
}

export interface BannerPagination {
  page: number;
  limit: number;
}
