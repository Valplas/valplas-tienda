// apps/api/src/modules/bot/bot.routes.ts
//
// API del bot de WhatsApp (canal de venta externo). Auth server-to-server por X-Api-Key, sin
// cookies: por eso está exenta de CSRF (csrf.middleware.ts → CSRF_EXEMPT_PREFIX). No montar
// authMiddleware ni nada que lea cookies de sesión en este router.
// Contrato para el equipo del bot: docs/BOT_API.md

import { Router } from 'express';
import * as botController from './bot.controller.js';
import { requireBotApiKey } from '../../shared/middleware/api-key.middleware.js';
import { botRateLimiter } from '../../shared/middleware/rate-limit.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery
} from '../../shared/middleware/validate.middleware.js';
import {
  catalogProductsQuerySchema,
  createBotOrderSchema,
  createCustomerAddressSchema,
  customerIdParamsSchema,
  findOrCreateCustomerSchema,
  orderActionSchema,
  orderCustomerQuerySchema,
  orderNumberParamsSchema,
  paginationQuerySchema,
  phoneParamsSchema,
  productIdParamsSchema,
  quoteSchema
} from './bot.validators.js';

const router = Router();

// Limiter antes de la auth: también frena intentos con keys inválidas
router.use(botRateLimiter);
router.use(requireBotApiKey);

/**
 * @swagger
 * /api/bot/catalog/status:
 *   get:
 *     summary: Versión global del catálogo (para que el bot sepa cuándo re-descargarlo)
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     responses:
 *       200:
 *         description: "{ catalogVersion (número, sube con cada cambio de catálogo), catalogUpdatedAt, storeInfoUpdatedAt }"
 *       401:
 *         description: INVALID_API_KEY
 */
router.get('/catalog/status', botController.getCatalogStatus);

/**
 * @swagger
 * /api/bot/catalog/categories:
 *   get:
 *     summary: Árbol de categorías activas
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     responses:
 *       200:
 *         description: "{ categories: [{ id, name, slug, children }] }"
 *       401:
 *         description: INVALID_API_KEY
 */
router.get('/catalog/categories', botController.listCategories);

/**
 * @swagger
 * /api/bot/store/info:
 *   get:
 *     summary: Datos del negocio (horarios, reparto, pagos, transferencia, contacto)
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     responses:
 *       200:
 *         description: "{ businessHours, deliveryDays, deliveryZones, minimumOrder, freeShippingFrom, paymentMethods, transferDetails: { alias, cbu, holder, bank } | null, pickupAddress, priceListUrl, contactPhone, contactEmail, additionalInfo, updatedAt } — campo sin dato = null"
 *       401:
 *         description: INVALID_API_KEY
 */
router.get('/store/info', botController.getStoreInfo);

/**
 * @swagger
 * /api/bot/catalog/products:
 *   get:
 *     summary: Buscar productos activos con stock (nombre o SKU)
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: category_id, schema: { type: string, format: uuid } }
 *       - { in: query, name: brand_id, schema: { type: string, format: uuid } }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [featured, price_asc, price_desc, name_asc, name_desc, newest] }
 *       - in: query
 *         name: include_out_of_stock
 *         description: "true incluye productos activos sin stock disponible (inStock false, purchasable false). Por defecto solo los que tienen stock."
 *         schema: { type: string, enum: ['true', 'false'], default: 'false' }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 50 } }
 *     responses:
 *       200:
 *         description: "Lista paginada. Cada producto trae inStock (availableStock > 0), purchasable (tiene presentaciones Y stock disponible; cambió de significado: antes solo consideraba presentaciones) y presentations (priceListId, bundleSize, bundlePrice, availableBundles)."
 */
router.get(
  '/catalog/products',
  validateQuery(catalogProductsQuerySchema),
  botController.searchProducts
);

/**
 * @swagger
 * /api/bot/catalog/products/{id}:
 *   get:
 *     summary: Detalle de un producto (precio por presentación y stock actual)
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: "{ product } con inStock (availableStock > 0) y purchasable (tiene presentaciones Y stock disponible; antes solo consideraba presentaciones)."
 *       404:
 *         description: PRODUCT_NOT_FOUND (no existe, inactivo o borrado)
 */
router.get(
  '/catalog/products/:id',
  validateParams(productIdParamsSchema),
  botController.getProduct
);

/**
 * @swagger
 * /api/bot/customers/by-phone/{phone}:
 *   get:
 *     summary: Buscar cliente por teléfono (mismo número nacional, en cualquier formato)
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         description: wa_id de WhatsApp (5491122334455) o E.164 (+5491122334455)
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ customer: { id, firstName, lastName, phone, email } }"
 *       400:
 *         description: INVALID_PHONE
 *       403:
 *         description: CUSTOMER_INACTIVE
 *       404:
 *         description: CUSTOMER_NOT_FOUND
 */
router.get(
  '/customers/by-phone/:phone',
  validateParams(phoneParamsSchema),
  botController.findCustomerByPhone
);

/**
 * @swagger
 * /api/bot/customers:
 *   post:
 *     summary: Buscar o crear cliente por teléfono
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, first_name]
 *             properties:
 *               phone: { type: string, example: '5491122334455' }
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: 'Cliente existente (no se modifican sus datos): { customer, created: false }'
 *       201:
 *         description: 'Cliente creado (signupChannel whatsapp): { customer, created: true }'
 *       403:
 *         description: CUSTOMER_INACTIVE
 *       409:
 *         description: EMAIL_IN_USE | PHONE_IN_USE
 */
router.post(
  '/customers',
  validateBody(findOrCreateCustomerSchema),
  botController.findOrCreateCustomer
);

/**
 * @swagger
 * /api/bot/customers/{id}/addresses:
 *   get:
 *     summary: Direcciones activas del cliente (con isDeliverable)
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 50 } }
 *     responses:
 *       200:
 *         description: Lista paginada de direcciones
 *       404:
 *         description: CUSTOMER_NOT_FOUND
 *   post:
 *     summary: Agregar dirección al cliente
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [street, street_number, city, province, postcode]
 *             properties:
 *               alias: { type: string, default: WhatsApp }
 *               street: { type: string }
 *               street_number: { type: string }
 *               floor: { type: string }
 *               apartment: { type: string }
 *               city: { type: string }
 *               province: { type: string, example: CABA }
 *               postcode: { type: string, example: '1043' }
 *               notes: { type: string }
 *               is_default: { type: boolean }
 *     responses:
 *       201:
 *         description: "{ address } (isDeliverable = alguna zona cubre el CP)"
 */
router.get(
  '/customers/:id/addresses',
  validateParams(customerIdParamsSchema),
  validateQuery(paginationQuerySchema),
  botController.getCustomerAddresses
);
router.post(
  '/customers/:id/addresses',
  validateParams(customerIdParamsSchema),
  validateBody(createCustomerAddressSchema),
  botController.addCustomerAddress
);

/**
 * @swagger
 * /api/bot/customers/{id}/orders:
 *   get:
 *     summary: Órdenes del cliente (todos los canales), más recientes primero
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 50 } }
 *     responses:
 *       200:
 *         description: Lista paginada de resúmenes de órdenes
 */
router.get(
  '/customers/:id/orders',
  validateParams(customerIdParamsSchema),
  validateQuery(paginationQuerySchema),
  botController.getCustomerOrders
);

/**
 * @swagger
 * /api/bot/quote:
 *   post:
 *     summary: Cotizar carrito (precio, stock y opciones de envío) sin crear nada
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               customer_id: { type: string, format: uuid }
 *               shipping_address_id: { type: string, format: uuid, description: Requiere customer_id }
 *               postcode: { type: string, description: Alternativa a shipping_address_id }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   description: |
 *                     Dos formatos (no mezclables en un mismo ítem; con units + price_list_id
 *                     responde 400 VALIDATION_ERROR). Por presentación: { product_id,
 *                     price_list_id, quantity } (bultos). Por unidades: { product_id, units }; el
 *                     servidor elige la combinación exacta más barata de presentaciones. Varios
 *                     ítems units del mismo producto se planifican juntos (suma).
 *                   properties:
 *                     product_id: { type: string, format: uuid }
 *                     price_list_id: { type: string, format: uuid }
 *                     quantity: { type: integer, minimum: 1, description: Bultos de la presentación }
 *                     units: { type: integer, minimum: 1, maximum: 100000, description: Unidades sueltas pedidas (modo units) }
 *     responses:
 *       200:
 *         description: |
 *           { items, requested, problems, subtotal, orderable, shipping: { postcode, options, error } | null }.
 *           items = líneas cotizadas planas (cada una con label y description de la presentación).
 *           requested = una entrada por ítem recibido, en orden: { productId, units, subtotal,
 *           breakdown: [líneas] }. Si dos ítems units comparten producto, el primero lleva el
 *           breakdown y el subtotal completos; los siguientes vienen con breakdown [], subtotal 0
 *           y mergedInto = índice del primero. problems puede incluir UNITS_NOT_ACHIEVABLE
 *           { productId, productName, requested, nearestBelow, nearestAbove } y UNITS_PLAN_MISMATCH
 *           { productId, productName, requested } (las presentaciones cambiaron mientras se
 *           cotizaba: volver a cotizar).
 */
router.post('/quote', validateBody(quoteSchema), botController.quote);

/**
 * @swagger
 * /api/bot/orders:
 *   post:
 *     summary: Crear orden WSP (pago con Mercado Pago) y devolver el link de pago
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customer_id, shipping_address_id, shipping_carrier_id, items, idempotency_key]
 *             properties:
 *               customer_id: { type: string, format: uuid }
 *               shipping_address_id: { type: string, format: uuid }
 *               shipping_carrier_id: { type: string, format: uuid }
 *               notes: { type: string, maxLength: 500 }
 *               idempotency_key: { type: string, minLength: 8, maxLength: 100 }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   description: "Mismos formatos que /quote: { product_id, price_list_id, quantity } o { product_id, units }"
 *                   properties:
 *                     product_id: { type: string, format: uuid }
 *                     price_list_id: { type: string, format: uuid }
 *                     quantity: { type: integer, minimum: 1 }
 *                     units: { type: integer, minimum: 1, maximum: 100000 }
 *     responses:
 *       201:
 *         description: '{ order, paymentUrl, created: true }. paymentUrl null = Mercado Pago falló: reintentar con /payment-link'
 *       200:
 *         description: 'Reintento con la misma idempotency_key: { order, paymentUrl, created: false }'
 *       400:
 *         description: INVALID_SHIPPING_ADDRESS | INVALID_CARRIER | PRODUCT_NOT_FOUND | PRODUCT_UNAVAILABLE | PRICE_TIER_NOT_FOUND | POSTCODE_NOT_COVERED
 *       409:
 *         description: INSUFFICIENT_STOCK | IDEMPOTENCY_KEY_CONFLICT | UNITS_PLAN_MISMATCH (modo units, las presentaciones cambiaron - volver a cotizar)
 *       422:
 *         description: "UNITS_NOT_ACHIEVABLE (modo units): details { productId, requested, nearestBelow, nearestAbove }"
 */
router.post('/orders', validateBody(createBotOrderSchema), botController.createOrder);

/**
 * @swagger
 * /api/bot/orders/{orderNumber}:
 *   get:
 *     summary: Estado y detalle de una orden del cliente
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - { in: path, name: orderNumber, required: true, schema: { type: string, example: WSP-20261116-000123 } }
 *       - { in: query, name: customer_id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: "{ order }"
 *       404:
 *         description: ORDER_NOT_FOUND (no existe o es de otro cliente)
 */
router.get(
  '/orders/:orderNumber',
  validateParams(orderNumberParamsSchema),
  validateQuery(orderCustomerQuerySchema),
  botController.getOrder
);

/**
 * @swagger
 * /api/bot/orders/{orderNumber}/payment-link:
 *   post:
 *     summary: Generar un link de pago nuevo para una orden pendiente
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - { in: path, name: orderNumber, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customer_id]
 *             properties:
 *               customer_id: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: "{ orderNumber, paymentUrl, expiresAt }"
 *       409:
 *         description: ORDER_NOT_PAYABLE | ORDER_PAYMENT_EXPIRED
 *       502:
 *         description: PAYMENT_PROVIDER_ERROR
 */
router.post(
  '/orders/:orderNumber/payment-link',
  validateParams(orderNumberParamsSchema),
  validateBody(orderActionSchema),
  botController.regeneratePaymentLink
);

/**
 * @swagger
 * /api/bot/orders/{orderNumber}/cancel:
 *   post:
 *     summary: Cancelar una orden pendiente de pago (libera el stock reservado)
 *     tags: [Bot]
 *     security:
 *       - botApiKey: []
 *     parameters:
 *       - { in: path, name: orderNumber, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customer_id]
 *             properties:
 *               customer_id: { type: string, format: uuid }
 *               reason: { type: string, maxLength: 300 }
 *     responses:
 *       200:
 *         description: "{ order } con status cancelled"
 *       409:
 *         description: ORDER_NOT_CANCELLABLE
 */
router.post(
  '/orders/:orderNumber/cancel',
  validateParams(orderNumberParamsSchema),
  validateBody(orderActionSchema),
  botController.cancelOrder
);

export default router;
