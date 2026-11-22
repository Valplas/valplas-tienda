// apps/api/src/modules/shipments/shipment.validators.ts

import { z } from 'zod';

const positive = z.number().positive();

export const shipmentPackageSchema = z.object({
  kilos: positive,
  volume_cm3: positive,
  largo_cm: positive.optional(),
  ancho_cm: positive.optional(),
  alto_cm: positive.optional()
});

export const createShipmentSchema = z.object({
  service_type: z.enum(['home_delivery', 'branch_pickup']),
  branch_id: z.string().min(1).max(50).optional(),
  localidad: z.string().min(1).max(100).optional(),
  packages: z.array(shipmentPackageSchema).min(1).max(300).optional()
});

export const branchesQuerySchema = z.object({
  postcode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,8}$/, 'Código postal inválido'),
  limit: z.coerce.number().int().min(1).max(50).optional()
});

export const idParamSchema = z.object({ id: z.string().uuid() });
export const orderIdParamSchema = z.object({ orderId: z.string().uuid() });

export type CreateShipmentBody = z.infer<typeof createShipmentSchema>;
