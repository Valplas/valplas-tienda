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

export const mergeSuggestionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const dismissSuggestionSchema = z.object({
  user_id: z.string().uuid(),
  legacy_user_id: z.string().uuid()
});
