// apps/api/src/modules/shipping/shipping.routes.ts

import { Router } from 'express';
import * as shippingController from './shipping.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import {
  createShippingZoneSchema,
  updateShippingZoneSchema,
  createShippingCarrierSchema,
  updateShippingCarrierSchema,
  createShippingRateSchema,
  updateShippingRateSchema,
  getShippingQuoteSchema,
  listShippingZonesSchema,
  listShippingCarriersSchema,
  listShippingRatesSchema
} from './shipping.validators.js';

const router = Router();

// ============= PUBLIC ROUTES =============

/**
 * @swagger
 * /api/shipping/quote:
 *   get:
 *     summary: Get shipping quotes
 *     tags: [Shipping]
 *     parameters:
 *       - in: query
 *         name: postcode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: cart_total
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Shipping quotes
 */
router.get('/quote', validate(getShippingQuoteSchema, 'query'), shippingController.getShippingQuote);

/**
 * @swagger
 * /api/shipping/carriers:
 *   get:
 *     summary: Get active carriers (public)
 *     tags: [Shipping]
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
 *         description: List of active carriers
 */
router.get(
  '/carriers',
  validate(listShippingCarriersSchema, 'query'),
  shippingController.getAllCarriers
);

// ============= ADMIN ROUTES =============

// Shipping Zones (Admin only)
router.get(
  '/zones',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(listShippingZonesSchema, 'query'),
  shippingController.getAllZones
);

router.get(
  '/zones/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  shippingController.getZoneById
);

router.post(
  '/zones',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(createShippingZoneSchema, 'body'),
  shippingController.createZone
);

router.patch(
  '/zones/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(updateShippingZoneSchema, 'body'),
  shippingController.updateZone
);

router.delete(
  '/zones/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  shippingController.deleteZone
);

// Shipping Carriers (Admin only)
router.get(
  '/admin/carriers',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(listShippingCarriersSchema, 'query'),
  shippingController.getAllCarriers
);

router.get(
  '/admin/carriers/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  shippingController.getCarrierById
);

router.post(
  '/admin/carriers',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(createShippingCarrierSchema, 'body'),
  shippingController.createCarrier
);

router.patch(
  '/admin/carriers/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(updateShippingCarrierSchema, 'body'),
  shippingController.updateCarrier
);

router.delete(
  '/admin/carriers/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  shippingController.deleteCarrier
);

// Shipping Rates (Admin only)
router.get(
  '/rates',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(listShippingRatesSchema, 'query'),
  shippingController.getAllRates
);

router.get(
  '/rates/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  shippingController.getRateById
);

router.post(
  '/rates',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(createShippingRateSchema, 'body'),
  shippingController.createRate
);

router.patch(
  '/rates/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  validate(updateShippingRateSchema, 'body'),
  shippingController.updateRate
);

router.delete(
  '/rates/:id',
  authMiddleware,
  requireRole(['admin', 'owner']),
  shippingController.deleteRate
);

export default router;
