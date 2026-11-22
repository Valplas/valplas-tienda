// apps/api/src/modules/shipments/shipment.routes.ts

import { Router } from 'express';
import * as shipmentController from './shipment.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import {
  branchesQuerySchema,
  createShipmentSchema,
  idParamSchema,
  orderIdParamSchema,
  previewQuerySchema
} from './shipment.validators.js';

const router = Router();

// Todo el backoffice de envíos es solo para admin / owner
router.use(authMiddleware, requireRole(['admin', 'owner']));

/**
 * @swagger
 * /api/shipments/branches:
 *   get:
 *     summary: Sucursales de Andreani para retiro cerca de un código postal
 *     tags: [Shipments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: postcode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *     responses:
 *       200:
 *         description: Lista de sucursales
 *       503:
 *         description: Integración con Andreani deshabilitada
 */
router.get('/branches', validate(branchesQuerySchema, 'query'), shipmentController.branches);

/**
 * @swagger
 * /api/shipments/orders/{orderId}/preview:
 *   get:
 *     summary: Vista previa del envío de un pedido (bultos, contrato, localidad, avisos)
 *     tags: [Shipments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: service_type
 *         schema:
 *           type: string
 *           enum: [home_delivery, branch_pickup]
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Preview con canCreate y blockReason
 *       404:
 *         description: Pedido no encontrado
 */
router.get(
  '/orders/:orderId/preview',
  validate(orderIdParamSchema, 'params'),
  validate(previewQuerySchema, 'query'),
  shipmentController.preview
);

/**
 * @swagger
 * /api/shipments/orders/{orderId}:
 *   post:
 *     summary: Generar el envío Andreani de un pedido (pre-envío + etiqueta)
 *     tags: [Shipments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [service_type]
 *             properties:
 *               service_type:
 *                 type: string
 *                 enum: [home_delivery, branch_pickup]
 *               branch_id:
 *                 type: string
 *               localidad:
 *                 type: string
 *               packages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [kilos, volume_cm3]
 *                   properties:
 *                     kilos: { type: number }
 *                     volume_cm3: { type: number }
 *                     largo_cm: { type: number }
 *                     ancho_cm: { type: number }
 *                     alto_cm: { type: number }
 *     responses:
 *       201:
 *         description: Envío creado
 *       202:
 *         description: Pedido enviado a Andreani, pendiente de confirmación (status requesting)
 *       409:
 *         description: SHIPMENT_ORDER_NOT_READY o SHIPMENT_ALREADY_EXISTS
 *       422:
 *         description: ORDER_ADDRESS_REQUIRED, SHIPMENT_LOCALIDAD_REQUIRED, SHIPMENT_BRANCH_INVALID o ANDREANI_VALIDATION
 *       503:
 *         description: ANDREANI_DISABLED
 */
router.post(
  '/orders/:orderId',
  validate(orderIdParamSchema, 'params'),
  validate(createShipmentSchema, 'body'),
  shipmentController.create
);

/**
 * @swagger
 * /api/shipments/{id}/cancel:
 *   post:
 *     summary: Cancelar un envío (solo antes de la admisión física)
 *     tags: [Shipments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Envío en estado cancelling
 *       409:
 *         description: SHIPMENT_NOT_CANCELLABLE
 */
router.post('/:id/cancel', validate(idParamSchema, 'params'), shipmentController.cancel);

/**
 * @swagger
 * /api/shipments/{id}/refresh:
 *   post:
 *     summary: Consultar a Andreani el estado actual del envío
 *     tags: [Shipments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Envío actualizado
 *       404:
 *         description: Envío no encontrado
 */
router.post('/:id/refresh', validate(idParamSchema, 'params'), shipmentController.refresh);

/**
 * @swagger
 * /api/shipments/{id}/label:
 *   get:
 *     summary: Descargar la etiqueta del envío (PDF)
 *     tags: [Shipments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: PDF de la etiqueta
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       409:
 *         description: SHIPMENT_LABEL_NOT_READY
 */
router.get('/:id/label', validate(idParamSchema, 'params'), shipmentController.label);

export default router;
