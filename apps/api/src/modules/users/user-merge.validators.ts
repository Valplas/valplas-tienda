import { z } from 'zod';

export const mergeIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const mergeBodySchema = z.object({
  source_user_id: z.string().uuid()
});

export const mergePreviewQuerySchema = z.object({
  source_user_id: z.string().uuid()
});
