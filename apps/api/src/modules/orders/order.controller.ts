// apps/api/src/modules/orders/order.controller.ts

import type { Request, Response, NextFunction } from 'express';
import * as orderDomain from './order.domain.js';
import { ApiResponse } from '../../shared/utils/api-response.js';

/**
 * Get current user's orders
 */
export async function getMyOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const { page, limit, status, from_date, to_date, order_number } = req.query;

    const result = await orderDomain.getUserOrders(userId, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      status: status as any,
      from_date: from_date as string,
      to_date: to_date as string,
      order_number: order_number as string
    });

    return res.json(
      ApiResponse.paginated(result.orders, Number(page) || 1, Number(limit) || 20, result.total)
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get all orders (admin only)
 */
export async function getAllOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, user_id, status, from_date, to_date, order_number } = req.query;

    const result = await orderDomain.getAllOrders({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      user_id: user_id as string,
      status: status as any,
      from_date: from_date as string,
      to_date: to_date as string,
      order_number: order_number as string
    });

    return res.json(
      ApiResponse.paginated(result.orders, Number(page) || 1, Number(limit) || 20, result.total)
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get order by ID
 */
export async function getOrderById(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const isAdmin = ['admin', 'owner'].includes(req.user!.role);

    const order = await orderDomain.getOrderById(req.params.id, userId, isAdmin);

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
    const userId = req.user!.userId;
    const isAdmin = ['admin', 'owner'].includes(req.user!.role);

    const order = await orderDomain.getOrderByNumber(req.params.orderNumber, userId, isAdmin);

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
    const userId = req.user!.userId;
    const order = await orderDomain.createOrder(userId, req.body);

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
    const userId = req.user!.userId;
    const isAdmin = ['admin', 'owner'].includes(req.user!.role);

    const order = await orderDomain.updateOrderStatus(req.params.id, req.body, userId, isAdmin);

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
    const userId = req.user!.userId;
    const isAdmin = ['admin', 'owner'].includes(req.user!.role);
    const { notes } = req.body;

    const order = await orderDomain.cancelOrder(req.params.id, notes || 'Cancelado por usuario', userId, isAdmin);

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
    const userId = req.user!.userId;
    const summary = await orderDomain.getUserOrderSummary(userId);

    return res.json(ApiResponse.success(summary));
  } catch (error) {
    next(error);
  }
}
