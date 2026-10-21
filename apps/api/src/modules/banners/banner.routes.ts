import { Router } from 'express';
import * as bannerController from './banner.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { validateBody, validateQuery } from '../../shared/middleware/validate.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import { uploadImageFields } from '../../shared/middleware/image-upload.middleware.js';
import {
  adminBannersQuerySchema,
  bannerIdParamSchema,
  createBannerSchema,
  publicBannersQuerySchema,
  reorderBannersSchema,
  updateBannerSchema
} from './banner.validator.js';

const router = Router();

const staffOnly = [authMiddleware, requireRole(['admin', 'owner'])];

const bannerImageFields = uploadImageFields([
  { name: 'desktop_image', required: true },
  { name: 'mobile_image' }
]);

/**
 * @swagger
 * /api/banners:
 *   get:
 *     summary: Banners visibles de la home (activos y vigentes, en orden)
 *     tags: [Banners]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 20 }
 *     responses:
 *       200:
 *         description: Lista paginada. linkProductSlug → ficha del producto; si no, catálogo filtrado por linkCategoryId/linkBrandId.
 */
router.get('/', validateQuery(publicBannersQuerySchema), bannerController.listPublicBanners);

/**
 * @swagger
 * /api/banners/admin:
 *   get:
 *     summary: Todos los banners no borrados, incluidos inactivos (admin/owner)
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 100 }
 *     responses:
 *       200:
 *         description: Lista paginada con nombres y estado de los destinos
 */
router.get(
  '/admin',
  ...staffOnly,
  validateQuery(adminBannersQuerySchema),
  bannerController.listAdminBanners
);

/**
 * @swagger
 * /api/banners:
 *   post:
 *     summary: Crear banner (admin/owner)
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [desktop_image, title]
 *             properties:
 *               desktop_image: { type: string, format: binary, description: 'Recorte PC (3:1)' }
 *               mobile_image: { type: string, format: binary, description: 'Recorte celular (4:3), opcional' }
 *               title: { type: string, maxLength: 120 }
 *               link_category_id: { type: string, format: uuid }
 *               link_brand_id: { type: string, format: uuid }
 *               link_product_id: { type: string, format: uuid }
 *               is_active: { type: boolean, default: true }
 *               starts_at: { type: string, format: date-time }
 *               ends_at: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Banner creado (se agrega al final del orden)
 */
router.post(
  '/',
  ...staffOnly,
  bannerImageFields, // multer primero: puebla req.files/req.body desde el multipart stream
  validateBody(createBannerSchema),
  bannerController.createBanner
);

/**
 * @swagger
 * /api/banners/order:
 *   put:
 *     summary: Reordenar banners (admin/owner)
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [banner_ids]
 *             properties:
 *               banner_ids:
 *                 type: array
 *                 description: Todos los banners no borrados, en el orden deseado
 *                 items: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Orden actualizado
 */
router.put('/order', ...staffOnly, validate(reorderBannersSchema), bannerController.reorderBanners);

/**
 * @swagger
 * /api/banners/{id}:
 *   patch:
 *     summary: Actualizar datos del banner (admin/owner)
 *     description: Campos omitidos no se tocan; null limpia el destino o la fecha.
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, maxLength: 120 }
 *               link_category_id: { type: string, format: uuid, nullable: true }
 *               link_brand_id: { type: string, format: uuid, nullable: true }
 *               link_product_id: { type: string, format: uuid, nullable: true }
 *               is_active: { type: boolean }
 *               starts_at: { type: string, format: date-time, nullable: true }
 *               ends_at: { type: string, format: date-time, nullable: true }
 *     responses:
 *       200:
 *         description: Banner actualizado
 *   delete:
 *     summary: Eliminar banner (admin/owner)
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Banner eliminado
 */
router.patch(
  '/:id',
  ...staffOnly,
  validate(bannerIdParamSchema, 'params'),
  validateBody(updateBannerSchema),
  bannerController.updateBanner
);

router.delete(
  '/:id',
  ...staffOnly,
  validate(bannerIdParamSchema, 'params'),
  bannerController.deleteBanner
);

/**
 * @swagger
 * /api/banners/{id}/images:
 *   post:
 *     summary: Reemplazar imágenes del banner (admin/owner)
 *     description: Reemplaza el par completo. Sin mobile_image, el celular usa la imagen de PC.
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [desktop_image]
 *             properties:
 *               desktop_image: { type: string, format: binary }
 *               mobile_image: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Imágenes reemplazadas
 */
router.post(
  '/:id/images',
  ...staffOnly,
  validate(bannerIdParamSchema, 'params'),
  bannerImageFields,
  bannerController.replaceBannerImages
);

export default router;
