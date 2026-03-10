// apps/api/src/modules/orders/order.routes.ts

import { Router } from 'express';
import * as orderController from './order.controller.js';
import { validate } from '../../shared/middleware/validation.middleware.js';
import { authMiddleware, requireRole } from '../../shared/middleware/auth.middleware.js';
import {
  createOrderSchema,
  createAdminOrderSchema,
  updateOrderStatusSchema,
  listOrdersSchema,
  adminListOrdersSchema
} from './order.validators.js';

const router = Router();

// All order routes require authentication
router.use(authMiddleware);

// ============= USER ROUTES =============

/**
 * @swagger
 * /api/orders/me:
 *   get:
 *     summary: Get current user's orders
 *     tags: [Orders]
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
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: User's orders
 */
router.get('/me', validate(listOrdersSchema, 'query'), orderController.getMyOrders);

/**
 * @swagger
 * /api/orders/me/summary:
 *   get:
 *     summary: Get user order summary statistics
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order summary
 */
router.get('/me/summary', orderController.getOrderSummary);

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create new order
 *     tags: [Orders]
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
 *         description: Order created
 */
router.post('/', validate(createOrderSchema, 'body'), orderController.createOrder);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Orders]
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
 *         description: Order details
 */
router.get('/:id', orderController.getOrderById);

/**
 * @swagger
 * /api/orders/number/{orderNumber}:
 *   get:
 *     summary: Get order by order number
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order details
 */
router.get('/number/:orderNumber', orderController.getOrderByNumber);

/**
 * @swagger
 * /api/orders/{id}/status:
 *   patch:
 *     summary: Update order status
 *     tags: [Orders]
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
 *         description: Order status updated
 */
router.patch(
  '/:id/status',
  validate(updateOrderStatusSchema, 'body'),
  orderController.updateOrderStatus
);

/**
 * @swagger
 * /api/orders/{id}/cancel:
 *   post:
 *     summary: Cancel order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order cancelled
 */
router.post('/:id/cancel', orderController.cancelOrder);

// ============= ADMIN ROUTES =============

/**
 * @swagger
 * /api/orders/admin/all:
 *   get:
 *     summary: Get all orders (admin only)
 *     tags: [Orders]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All orders
 */
router.get(
  '/admin/all',
  requireRole(['admin', 'owner']),
  validate(adminListOrdersSchema, 'query'),
  orderController.getAllOrders
);

/**
 * @swagger
 * /api/orders/admin/create:
 *   post:
 *     summary: Create order as admin for a specific user
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, shipping_address_id, items]
 *             properties:
 *               user_id:
 *                 type: string
 *               shipping_address_id:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [product_id, quantity, unit_price]
 *               notes:
 *                 type: string
 *               payment_method:
 *                 type: string
 *     responses:
 *       201:
 *         description: Order created by admin
 */
router.post(
  '/admin/create',
  requireRole(['admin', 'owner']),
  validate(createAdminOrderSchema, 'body'),
  orderController.createAdminOrder
);

export default router;
