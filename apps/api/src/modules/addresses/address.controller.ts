// apps/api/src/modules/addresses/address.controller.ts

import type { Request, Response, NextFunction } from 'express';
import * as addressDomain from './address.domain.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

/**
 * Get current user's addresses
 */
export async function getMyAddresses(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const { page, limit, is_default, is_active, province, city } = req.query;

    const result = await addressDomain.getUserAddresses(userId, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      is_default: is_default === 'true' ? true : is_default === 'false' ? false : undefined,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
      province: province as string,
      city: city as string
    });

    return res.json(
      ApiResponse.paginated(
        result.addresses,
        Number(page) || 1,
        Number(limit) || 20,
        result.total
      )
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get all addresses (admin only)
 */
export async function getAllAddresses(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, user_id, is_default, is_active, province, city } = req.query;

    const result = await addressDomain.getAllAddresses({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      user_id: user_id as string,
      is_default: is_default === 'true' ? true : is_default === 'false' ? false : undefined,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
      province: province as string,
      city: city as string
    });

    return res.json(
      ApiResponse.paginated(
        result.addresses,
        Number(page) || 1,
        Number(limit) || 20,
        result.total
      )
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get address by ID
 */
export async function getAddressById(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const isAdmin = ['admin', 'owner'].includes(req.user!.role);

    const address = await addressDomain.getAddressById(req.params.id as string as string, userId, isAdmin);

    return res.json(ApiResponse.success(address));
  } catch (error) {
    next(error);
  }
}

/**
 * Get user's default address
 */
export async function getDefaultAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const address = await addressDomain.getDefaultAddress(userId);

    if (!address) {
      return res.status(404).json(ApiResponse.error('NOT_FOUND', 'No hay dirección por defecto'));
    }

    return res.json(ApiResponse.success(address));
  } catch (error) {
    next(error);
  }
}

/**
 * Create address
 */
export async function createAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const address = await addressDomain.createAddress(userId, req.body);

    return res.status(201).json(ApiResponse.success(address));
  } catch (error) {
    next(error);
  }
}

/**
 * Update address
 */
export async function updateAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const isAdmin = ['admin', 'owner'].includes(req.user!.role);

    const address = await addressDomain.updateAddress(req.params.id as string as string, userId, req.body, isAdmin);

    return res.json(ApiResponse.success(address));
  } catch (error) {
    next(error);
  }
}

/**
 * Delete address
 */
export async function deleteAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const isAdmin = ['admin', 'owner'].includes(req.user!.role);

    await addressDomain.deleteAddress(req.params.id as string as string, userId, isAdmin);

    return res.json(ApiResponse.success({ message: 'Dirección eliminada correctamente' }));
  } catch (error) {
    next(error);
  }
}

/**
 * Set address as default
 */
export async function setDefaultAddress(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const isAdmin = ['admin', 'owner'].includes(req.user!.role);

    const address = await addressDomain.setDefaultAddress(req.params.id as string as string, userId, isAdmin);

    return res.json(ApiResponse.success(address));
  } catch (error) {
    next(error);
  }
}
