import { Router } from 'express';
import * as settingsController from './settings.controller.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { storeInfoSchema } from './store-info.validator.js';
import { uploadSingleImage } from '../../shared/middleware/image-upload.middleware.js';

const router = Router();

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Configuración pública de la tienda (logo)
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: "{ settings: { logoUrl, logoWidth, logoHeight } } — logoUrl null = sin logo (la web muestra el nombre)"
 */
router.get('/', settingsController.getSettings);

/**
 * @swagger
 * /api/settings/logo:
 *   post:
 *     summary: Subir o reemplazar el logo (admin/owner)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: 'PNG/WebP con transparencia recomendado' }
 *     responses:
 *       200:
 *         description: Logo actualizado
 *   delete:
 *     summary: Quitar el logo (admin/owner)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logo eliminado
 */
router.post(
  '/logo',
  authMiddleware,
  requireRole(['admin', 'owner']),
  uploadSingleImage,
  settingsController.uploadLogo
);

router.delete(
  '/logo',
  authMiddleware,
  requireRole(['admin', 'owner']),
  settingsController.deleteLogo
);

/**
 * @swagger
 * /api/settings/store-info:
 *   get:
 *     summary: Información del negocio (admin/owner)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ storeInfo: { businessHours, deliveryDays, ..., transferDetails, updatedAt } }"
 *   put:
 *     summary: Reemplazar la información del negocio (admin/owner). Campos omitidos quedan null
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               business_hours: { type: string }
 *               delivery_days: { type: array, items: { type: string, enum: [monday, tuesday, wednesday, thursday, friday, saturday, sunday] } }
 *               delivery_zones: { type: array, items: { type: string } }
 *               minimum_order: { type: number }
 *               free_shipping_from: { type: number }
 *               payment_methods: { type: array, items: { type: string, enum: [mercadopago, transfer, cash_on_delivery, cash_pickup] } }
 *               transfer_alias: { type: string }
 *               transfer_cbu: { type: string, description: "22 dígitos" }
 *               transfer_holder: { type: string }
 *               transfer_bank: { type: string }
 *               pickup_address: { type: string }
 *               price_list_url: { type: string, description: "https" }
 *               contact_phone: { type: string }
 *               contact_email: { type: string }
 *               additional_info: { type: string }
 *     responses:
 *       200:
 *         description: Información guardada
 *       400:
 *         description: VALIDATION_ERROR
 */
router.get(
  '/store-info',
  authMiddleware,
  requireRole(['admin', 'owner']),
  settingsController.getStoreInfo
);

router.put(
  '/store-info',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validateBody(storeInfoSchema),
  settingsController.updateStoreInfo
);

export default router;
