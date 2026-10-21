import { z } from 'zod';

export const bannerSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Poné un nombre para reconocerlo')
      .max(120, 'Máximo 120 caracteres'),
    // 'YYYY-MM-DD' (input date) o vacío = sin límite
    startsAt: z.string(),
    endsAt: z.string(),
    isActive: z.boolean()
  })
  .refine((data) => !data.startsAt || !data.endsAt || data.endsAt >= data.startsAt, {
    message: 'La fecha "hasta" no puede ser anterior a la fecha "desde"',
    path: ['endsAt']
  });

export type BannerFormData = z.infer<typeof bannerSchema>;
