// apps/api/src/modules/users/user.routes.ts

import { Router } from 'express';
import * as userController from './user.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import {
  createUserSchema,
  updateUserSchema,
  updateUserPasswordSchema,
  listUsersSchema
} from './user.validators.js';
import * as mergeController from './user-merge.controller.js';
import {
  mergeBodySchema,
  mergeIdParamsSchema,
  mergePreviewQuerySchema,
  mergeSuggestionsQuerySchema,
  dismissSuggestionSchema
} from './user-merge.validators.js';

const router = Router();

// All user management routes require authentication
router.use(authMiddleware);

// All routes require admin or owner role
router.use(requireRole(['admin', 'owner']));

// ============= USER MANAGEMENT ROUTES =============

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [owner, admin, driver, customer]
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: contact_status
 *         schema:
 *           type: string
 *           enum: [missing]
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/', validate(listUsersSchema, 'query'), userController.getAllUsers);

/**
 * @swagger
 * /api/users/stats:
 *   get:
 *     summary: Get user statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics
 */
router.get('/stats', userController.getUserStats);

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create new user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: User created
 */
router.post('/', validate(createUserSchema, 'body'), userController.createUser);

// ============= MERGE DE CUENTAS =============
// Antes de '/:id' para que las rutas estáticas (merge-suggestions) no se lean como un id.

/**
 * @swagger
 * /api/users/merge-suggestions:
 *   get:
 *     summary: Posibles duplicados entre cuentas nuevas y clientes legacy del CRM
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista paginada de pares con confianza high/medium
 */
router.get(
  '/merge-suggestions',
  validate(mergeSuggestionsQuerySchema, 'query'),
  mergeController.getMergeSuggestions
);

/**
 * @swagger
 * /api/users/merge-suggestions/dismiss:
 *   post:
 *     summary: Marca un par sugerido como "No es la misma persona"
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, legacy_user_id]
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *               legacy_user_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Par descartado
 */
router.post(
  '/merge-suggestions/dismiss',
  validate(dismissSuggestionSchema, 'body'),
  mergeController.dismissMergeSuggestion
);

/**
 * @swagger
 * /api/users/{id}/merge-preview:
 *   get:
 *     summary: Vista previa del merge de dos cuentas de cliente
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Cuenta que se conserva
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: source_user_id
 *         required: true
 *         description: Cuenta que se absorbe
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Identidad resultante, campos descartados y conteos a mover
 *       404:
 *         description: Alguna cuenta no existe o ya fue fusionada
 *       409:
 *         description: GOOGLE_ID_CONFLICT
 */
router.get(
  '/:id/merge-preview',
  validate(mergeIdParamsSchema, 'params'),
  validate(mergePreviewQuerySchema, 'query'),
  mergeController.getMergePreview
);

/**
 * @swagger
 * /api/users/{id}/merge:
 *   post:
 *     summary: Fusiona una cuenta de cliente dentro de otra
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Cuenta que se conserva
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [source_user_id]
 *             properties:
 *               source_user_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Merge aplicado (órdenes, direcciones e historial movidos)
 *       400:
 *         description: SAME_USER o MERGE_ROLE_NOT_ALLOWED
 *       404:
 *         description: Alguna cuenta no existe o ya fue fusionada
 *       409:
 *         description: GOOGLE_ID_CONFLICT
 */
router.post(
  '/:id/merge',
  validate(mergeIdParamsSchema, 'params'),
  validate(mergeBodySchema, 'body'),
  mergeController.mergeUser
);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 */
router.get('/:id', userController.getUserById);

/**
 * @swagger
 * /api/users/{id}/stats:
 *   get:
 *     summary: Get user with statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User with statistics
 */
router.get('/:id/stats', userController.getUserWithStats);

/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     summary: Update user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: User updated
 */
router.patch('/:id', validate(updateUserSchema, 'body'), userController.updateUser);

/**
 * @swagger
 * /api/users/{id}/password:
 *   patch:
 *     summary: Update user password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               new_password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password updated
 */
router.patch(
  '/:id/password',
  validate(updateUserPasswordSchema, 'body'),
  userController.updateUserPassword
);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted
 */
router.delete('/:id', userController.deleteUser);

/**
 * @swagger
 * /api/users/{id}/activate:
 *   post:
 *     summary: Activate user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User activated
 */
router.post('/:id/activate', userController.activateUser);

/**
 * @swagger
 * /api/users/{id}/deactivate:
 *   post:
 *     summary: Deactivate user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deactivated
 */
router.post('/:id/deactivate', userController.deactivateUser);

export default router;
