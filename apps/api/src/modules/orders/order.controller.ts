// apps/api/src/modules/orders/order.controller.ts

import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { OrderStatus } from './order.types.js';
import * as orderDomain from './order.domain.js';
import { clearCartCookie } from '../cart/cart.service.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';
import { logger } from '../../infrastructure/logger/index.js';
import type { FindOrdersResult } from './order.repository.js';

/**
 * Sin `page` la respuesta es por cursor ({ limit, hasMore, cursor, total solo en la primera
 * página }); con `page` conserva el formato clásico con total y totalPages.
 */
function orderListResponse(result: FindOrdersResult, page: number | undefined, limit: number) {
  if (page === undefined) {
    return ApiResponse.paginated(result.orders, {
      limit,
      hasMore: result.hasMore,
      cursor: result.nextCursor ?? undefined,
      total: result.total ?? undefined
    });
  }
  return ApiResponse.paginated(result.orders, page, limit, result.total ?? 0);
}

/**
 * Get current user's orders
 */
export async function getMyOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as AuthenticatedUser).userId;
    const { page, cursor, limit, status, from_date, to_date, order_number } = req.query;
    const pageNumber = page ? Number(page) : undefined;

    const result = await orderDomain.getUserOrders(userId, {
      page: pageNumber,
      cursor: cursor as string | undefined,
      limit: Number(limit) || 20,
      status: status as OrderStatus | undefined,
      from_date: from_date as string,
      to_date: to_date as string,
      order_number: order_number as string
    });

    return res.json(orderListResponse(result, pageNumber, Number(limit) || 20));
  } catch (error) {
    next(error);
  }
}

/**
 * Get all orders (admin only)
 */
export async function getAllOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      page,
      cursor,
      limit,
      user_id,
      status,
      from_date,
      to_date,
      order_number,
      search,
      include_items
    } = req.query;

    const pageNumber = page ? Number(page) : undefined;
    const result = await orderDomain.getAllOrders({
      page: pageNumber,
      cursor: cursor as string | undefined,
      limit: Number(limit) || 20,
      user_id: user_id as string,
      status: status as OrderStatus | undefined,
      from_date: from_date as string,
      to_date: to_date as string,
      order_number: order_number as string,
      search: search as string,
      includeItems: include_items === 'true'
    });

    return res.json(orderListResponse(result, pageNumber, Number(limit) || 20));
  } catch (error) {
    next(error);
  }
}

/**
 * Get order by ID
 */
export async function getOrderById(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as AuthenticatedUser).userId;
    const isAdmin = ['admin', 'owner'].includes((req.user as AuthenticatedUser).role);

    const order = await orderDomain.getOrderById(
      req.params.id as string as string,
      userId,
      isAdmin
    );

    return res.json(ApiResponse.success(order));
  } catch (error) {
    next(error);
  }
}

/**
 * Get order by order number
 */
export async function getOrderByNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as AuthenticatedUser).userId;
    const isAdmin = ['admin', 'owner'].includes((req.user as AuthenticatedUser).role);

    const order = await orderDomain.getOrderByNumber(
      req.params.orderNumber as string,
      userId,
      isAdmin
    );

    return res.json(ApiResponse.success(order));
  } catch (error) {
    next(error);
  }
}

/**
 * Create order
 */
export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as AuthenticatedUser).userId;
    const order = await orderDomain.createOrder(userId, req.body);

    // El carrito vive en una cookie HttpOnly: se vacía en esta misma respuesta
    // para que el usuario no vuelva de MP con el carrito lleno (doble compra).
    clearCartCookie(res);

    return res.status(201).json(ApiResponse.success(order));
  } catch (error) {
    next(error);
  }
}

/**
 * Update order status
 */
export async function updateOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as AuthenticatedUser).userId;
    const isAdmin = ['admin', 'owner'].includes((req.user as AuthenticatedUser).role);

    const order = await orderDomain.updateOrderStatus(
      req.params.id as string as string,
      req.body,
      userId,
      isAdmin
    );

    return res.json(ApiResponse.success(order));
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel order
 */
export async function cancelOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as AuthenticatedUser).userId;
    const isAdmin = ['admin', 'owner'].includes((req.user as AuthenticatedUser).role);
    const { notes } = req.body;

    const order = await orderDomain.cancelOrder(
      req.params.id as string as string,
      notes || 'Cancelado por usuario',
      userId,
      isAdmin
    );

    return res.json(ApiResponse.success(order));
  } catch (error) {
    next(error);
  }
}

/**
 * Create order as admin for a specific user
 */
export async function createAdminOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = (req.user as AuthenticatedUser).userId;

    logger.info('Admin creating order', {
      adminId,
      userId: req.body?.user_id,
      itemCount: Array.isArray(req.body?.items) ? req.body.items.length : 0
    });

    const order = await orderDomain.createAdminOrder(adminId, req.body);

    logger.info('Admin order created successfully', {
      adminId,
      orderId: order.id,
      orderNumber: order.order_number
    });

    return res.status(201).json(ApiResponse.success(order));
  } catch (error) {
    logger.error('Failed to create admin order', {
      adminId: (req.user as AuthenticatedUser | undefined)?.userId,
      // No loguear req.body completo: puede contener PII (direcciones, datos del cliente). Ver OBS-17.
      targetUserId: req.body?.user_id,
      itemCount: Array.isArray(req.body?.items) ? req.body.items.length : 0,
      error: error instanceof Error ? error.message : String(error)
    });
    next(error);
  }
}

/**
 * Update order items and/or address (admin only, processing status only)
 */
export async function updateAdminOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = (req.user as AuthenticatedUser).userId;
    const order = await orderDomain.updateAdminOrder(req.params.id as string, req.body, adminId);
    return res.json(ApiResponse.success(order));
  } catch (error) {
    next(error);
  }
}

/**
 * Get user order summary
 */
export async function getOrderSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as AuthenticatedUser).userId;
    const summary = await orderDomain.getUserOrderSummary(userId);

    return res.json(ApiResponse.success(summary));
  } catch (error) {
    next(error);
  }
}
