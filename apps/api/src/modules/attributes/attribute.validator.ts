import { z } from 'zod';

/** Alias/opciones: trim, sin vacíos ni duplicados. Los alias además van en minúsculas. */
const normalizeList = (lower: boolean) => (values: string[]) => {
  const out: string[] = [];
  for (const raw of values) {
    const v = lower ? raw.trim().toLowerCase() : raw.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
};

const aliasesSchema = z.array(z.string().max(40)).max(30).transform(normalizeList(true));
const optionsSchema = z.array(z.string().max(60)).max(50).transform(normalizeList(false));

export const attributeKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Clave inválida: minúsculas, números y _ (2 a 40 caracteres)');

export const createAttributeSchema = z
  .object({
    key: attributeKeySchema,
    label: z.string().trim().min(1).max(60),
    value_type: z.enum(['number', 'text', 'option']),
    unit: z.string().trim().min(1).max(20).nullish(),
    options: optionsSchema.nullish(),
    aliases: aliasesSchema.default([]),
    display_order: z.number().int().min(0).default(0),
    is_active: z.boolean().default(true)
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasOptions = !!data.options && data.options.length > 0;
    if (data.value_type === 'option' && !hasOptions) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Los atributos de tipo option requieren al menos una opción'
      });
    }
    if (data.value_type !== 'option' && data.options != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Solo los atributos de tipo option admiten opciones'
      });
    }
  });

/** `key` y `value_type` son inmutables: strict() los rechaza con 400. */
export const updateAttributeSchema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    unit: z.string().trim().min(1).max(20).nullable().optional(),
    options: optionsSchema.nullable().optional(),
    aliases: aliasesSchema.optional(),
    display_order: z.number().int().min(0).optional(),
    is_active: z.boolean().optional()
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar'
  });

export const setAttributeCategoriesSchema = z
  .object({
    category_ids: z.array(z.string().uuid()).max(500)
  })
  .strict();

export const listAttributesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(200)
});
