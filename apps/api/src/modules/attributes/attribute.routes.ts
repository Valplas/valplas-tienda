import { Router } from 'express';
import * as attributeController from './attribute.controller.js';
import { validateBody } from '../../shared/middleware/validate.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import {
  createAttributeSchema,
  updateAttributeSchema,
  setAttributeCategoriesSchema
} from './attribute.validator.js';

const router = Router();

// Diccionario de atributos: solo admin/owner
router.use(authMiddleware, requireRole(['admin', 'owner']));

/**
 * @swagger
 * /api/attributes:
 *   get:
 *     summary: Lista el diccionario de atributos con sus categorías asignadas
 *     description: Paginado; el diccionario es chico, por eso el límite por defecto es 200 (máximo 200).
 *     tags: [Attributes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 200, maximum: 200 }
 *     responses:
 *       200:
 *         description: Lista paginada de definiciones
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Sin permisos
 */
router.get('/', attributeController.listAttributes);

/**
 * @swagger
 * /api/attributes/for-category/{categoryId}:
 *   get:
 *     summary: Atributos activos de una categoría y sus ancestros
 *     description: Sin duplicados, ordenados por display_order de la asignación y luego de la definición.
 *     tags: [Attributes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Definiciones aplicables
 *       404:
 *         description: Categoría no encontrada
 */
router.get('/for-category/:categoryId', attributeController.listForCategory);

/**
 * @swagger
 * /api/attributes:
 *   post:
 *     summary: Crea una definición de atributo
 *     tags: [Attributes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key, label, value_type]
 *             properties:
 *               key: { type: string, pattern: '^[a-z][a-z0-9_]{1,39}$' }
 *               label: { type: string, maxLength: 60 }
 *               value_type: { type: string, enum: [number, text, option] }
 *               unit: { type: string, maxLength: 20, nullable: true }
 *               options: { type: array, items: { type: string }, description: Requerido (no vacío) solo para option }
 *               aliases: { type: array, items: { type: string } }
 *               display_order: { type: integer }
 *               is_active: { type: boolean }
 *     responses:
 *       201:
 *         description: Atributo creado
 *       400:
 *         description: Datos inválidos
 *       409:
 *         description: La clave ya existe (ATTRIBUTE_KEY_EXISTS)
 */
router.post('/', validateBody(createAttributeSchema), attributeController.createAttribute);

/**
 * @swagger
 * /api/attributes/{id}:
 *   patch:
 *     summary: Edita una definición (key y value_type son inmutables)
 *     tags: [Attributes]
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
 *               label: { type: string }
 *               unit: { type: string, nullable: true }
 *               options: { type: array, items: { type: string }, nullable: true }
 *               aliases: { type: array, items: { type: string } }
 *               display_order: { type: integer }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Atributo actualizado
 *       400:
 *         description: Datos inválidos (incluye intentar cambiar key)
 *       404:
 *         description: Atributo no encontrado
 */
router.patch('/:id', validateBody(updateAttributeSchema), attributeController.updateAttribute);

/**
 * @swagger
 * /api/attributes/{id}:
 *   delete:
 *     summary: Elimina una definición sin valores cargados
 *     description: Si tiene valores en productos responde 409 ATTRIBUTE_IN_USE; desactivarla con PATCH is_active=false.
 *     tags: [Attributes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Atributo eliminado
 *       404:
 *         description: Atributo no encontrado
 *       409:
 *         description: ATTRIBUTE_IN_USE
 */
router.delete('/:id', attributeController.deleteAttribute);

/**
 * @swagger
 * /api/attributes/{id}/categories:
 *   put:
 *     summary: Reemplaza las categorías a las que se asigna el atributo
 *     tags: [Attributes]
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
 *             required: [category_ids]
 *             properties:
 *               category_ids: { type: array, items: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Asignación actualizada
 *       404:
 *         description: Atributo o categoría no encontrada
 */
router.put(
  '/:id/categories',
  validateBody(setAttributeCategoriesSchema),
  attributeController.setCategories
);

export default router;
