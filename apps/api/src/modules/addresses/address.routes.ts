// apps/api/src/modules/addresses/address.routes.ts

import { Router } from 'express';
import * as addressController from './address.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import {
  createAddressSchema,
  updateAddressSchema,
  listAddressesSchema,
  adminListAddressesSchema
} from './address.validators.js';

const router = Router();

// All address routes require authentication
router.use(authMiddleware);

// ============= USER ROUTES =============

/**
 * @swagger
 * /api/addresses/me:
 *   get:
 *     summary: Get current user's addresses
 *     tags: [Addresses]
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
 *         name: is_default
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: string
 *           enum: [true, false]
 *     responses:
 *       200:
 *         description: User's addresses
 */
router.get('/me', validate(listAddressesSchema, 'query'), addressController.getMyAddresses);

/**
 * @swagger
 * /api/addresses/me/default:
 *   get:
 *     summary: Get current user's default address
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default address
 *       404:
 *         description: No default address found
 */
router.get('/me/default', addressController.getDefaultAddress);

/**
 * @swagger
 * /api/addresses:
 *   post:
 *     summary: Create new address
 *     tags: [Addresses]
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
 *         description: Address created
 */
router.post('/', validate(createAddressSchema, 'body'), addressController.createAddress);

/**
 * @swagger
 * /api/addresses/{id}:
 *   get:
 *     summary: Get address by ID
 *     tags: [Addresses]
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
 *         description: Address details
 */
router.get('/:id', addressController.getAddressById);

/**
 * @swagger
 * /api/addresses/{id}:
 *   patch:
 *     summary: Update address
 *     tags: [Addresses]
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
 *         description: Address updated
 */
router.patch('/:id', validate(updateAddressSchema, 'body'), addressController.updateAddress);

/**
 * @swagger
 * /api/addresses/{id}:
 *   delete:
 *     summary: Delete address
 *     tags: [Addresses]
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
 *         description: Address deleted
 */
router.delete('/:id', addressController.deleteAddress);

/**
 * @swagger
 * /api/addresses/{id}/set-default:
 *   post:
 *     summary: Set address as default
 *     tags: [Addresses]
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
 *         description: Address set as default
 */
router.post('/:id/set-default', addressController.setDefaultAddress);

// ============= ADMIN ROUTES =============

/**
 * @swagger
 * /api/addresses/admin/all:
 *   get:
 *     summary: Get all addresses (admin only)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
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
 *         description: All addresses
 */
router.get(
  '/admin/all',
  requireRole(['admin', 'owner']),
  validate(adminListAddressesSchema, 'query'),
  addressController.getAllAddresses
);

export default router;
