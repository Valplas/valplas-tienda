import { Router } from 'express';
import * as settingsController from './settings.controller.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
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

export default router;
