import { z } from 'zod';

/**
 * Los campos de texto de un multipart llegan siempre como string: '' o
 * 'null' significan "sin valor". Los mismos schemas sirven para JSON (PATCH),
 * donde los valores ya vienen tipados y el preprocess los deja pasar.
 */
function emptyToNull(value: unknown): unknown {
  return value === '' || value === 'null' ? null : value;
}

const nullableUuid = z.preprocess(
  emptyToNull,
  z.string().uuid('Debe ser un UUID válido').nullable().optional()
);

const nullableDatetime = z.preprocess(
  emptyToNull,
  z.string().datetime({ offset: true, message: 'Fecha inválida' }).nullable().optional()
);

// z.coerce.boolean() convierte 'false' en true (Boolean('false')).
const booleanish = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean()
);

const bannerFields = {
  title: z
    .string()
    .trim()
    .min(1, 'El nombre es requerido')
    .max(120, 'El nombre no puede exceder 120 caracteres'),
  link_category_id: nullableUuid,
  link_brand_id: nullableUuid,
  link_product_id: nullableUuid,
  is_active: booleanish.optional(),
  starts_at: nullableDatetime,
  ends_at: nullableDatetime
};

function hasValidWindow(data: { starts_at?: string | null; ends_at?: string | null }): boolean {
  if (!data.starts_at || !data.ends_at) return true;
  return new Date(data.ends_at) > new Date(data.starts_at);
}

const invalidWindow = {
  message: 'La fecha "hasta" debe ser posterior a la fecha "desde"',
  path: ['ends_at']
};

/** POST /api/banners (multipart: desktop_image, mobile_image + estos campos) */
export const createBannerSchema = z
  .object(bannerFields)
  .refine(hasValidWindow, invalidWindow)
  .transform((data) => ({
    title: data.title,
    linkCategoryId: data.link_category_id ?? null,
    linkBrandId: data.link_brand_id ?? null,
    linkProductId: data.link_product_id ?? null,
    isActive: data.is_active ?? true,
    startsAt: data.starts_at ?? null,
    endsAt: data.ends_at ?? null
  }));

/** PATCH /api/banners/:id (JSON parcial) — undefined = no tocar, null = limpiar */
export const updateBannerSchema = z
  .object(bannerFields)
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Debe proporcionar al menos un campo para actualizar'
  })
  .refine(hasValidWindow, invalidWindow)
  .transform((data) => ({
    title: data.title,
    linkCategoryId: data.link_category_id,
    linkBrandId: data.link_brand_id,
    linkProductId: data.link_product_id,
    isActive: data.is_active,
    startsAt: data.starts_at,
    endsAt: data.ends_at
  }));

export const reorderBannersSchema = z.object({
  banner_ids: z
    .array(z.string().uuid('Cada id debe ser un UUID válido'))
    .min(1, 'Debe incluir al menos un banner')
    .max(500)
});

export const bannerIdParamSchema = z.object({
  id: z.string().uuid('id de banner debe ser un UUID válido')
});

function paginationSchema(defaultLimit: number, maxLimit: number) {
  return z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(maxLimit).optional().default(defaultLimit)
  });
}

export const publicBannersQuerySchema = paginationSchema(10, 20);
export const adminBannersQuerySchema = paginationSchema(100, 100);

export type CreateBannerInput = z.output<typeof createBannerSchema>;
export type UpdateBannerInput = z.output<typeof updateBannerSchema>;
export type ReorderBannersInput = z.output<typeof reorderBannersSchema>;
