// apps/api/src/modules/users/user.controller.ts

import type { Request, Response, NextFunction } from 'express';
import * as userDomain from './user.domain.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

/**
 * Get all users (admin only)
 */
export async function getAllUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, role, is_active, email_verified, search } = req.query;

    const result = await userDomain.getAllUsers({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      role: role as any,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
      email_verified:
        email_verified === 'true' ? true : email_verified === 'false' ? false : undefined,
      search: search as string
    });

    return res.json(
      ApiResponse.paginated(result.users, Number(page) || 1, Number(limit) || 20, result.total)
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get user by ID
 */
export async function getUserById(req: Request, res: Response, next: NextFunction) {
  try {
    const requesterId = req.user!.userId;
    const requesterRole = req.user!.role as any;

    const user = await userDomain.getUserById(req.params.id as string as string, requesterId, requesterRole);

    return res.json(ApiResponse.success(user));
  } catch (error) {
    next(error);
  }
}

/**
 * Get user with statistics
 */
export async function getUserWithStats(req: Request, res: Response, next: NextFunction) {
  try {
    const requesterId = req.user!.userId;
    const requesterRole = req.user!.role as any;

    const user = await userDomain.getUserWithStats(req.params.id as string as string, requesterId, requesterRole);

    return res.json(ApiResponse.success(user));
  } catch (error) {
    next(error);
  }
}

/**
 * Create user (admin only)
 */
export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const requesterRole = req.user!.role as any;

    const user = await userDomain.createUser(req.body, requesterRole);

    return res.status(201).json(ApiResponse.success(user));
  } catch (error) {
    next(error);
  }
}

/**
 * Update user
 */
export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const requesterId = req.user!.userId;
    const requesterRole = req.user!.role as any;

    const user = await userDomain.updateUser(req.params.id as string as string, req.body, requesterId, requesterRole);

    return res.json(ApiResponse.success(user));
  } catch (error) {
    next(error);
  }
}

/**
 * Update user password
 */
export async function updateUserPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const requesterId = req.user!.userId;
    const requesterRole = req.user!.role as any;

    await userDomain.updateUserPassword(req.params.id as string as string, req.body, requesterId, requesterRole);

    return res.json(ApiResponse.success({ message: 'Contraseña actualizada correctamente' }));
  } catch (error) {
    next(error);
  }
}

/**
 * Delete user
 */
export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const requesterId = req.user!.userId;
    const requesterRole = req.user!.role as any;

    await userDomain.deleteUser(req.params.id as string as string, requesterId, requesterRole);

    return res.json(ApiResponse.success({ message: 'Usuario eliminado correctamente' }));
  } catch (error) {
    next(error);
  }
}

/**
 * Activate user
 */
export async function activateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const requesterId = req.user!.userId;
    const requesterRole = req.user!.role as any;

    const user = await userDomain.toggleUserActive(req.params.id as string as string, true, requesterId, requesterRole);

    return res.json(ApiResponse.success(user));
  } catch (error) {
    next(error);
  }
}

/**
 * Deactivate user
 */
export async function deactivateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const requesterId = req.user!.userId;
    const requesterRole = req.user!.role as any;

    const user = await userDomain.toggleUserActive(
      req.params.id as string as string,
      false,
      requesterId,
      requesterRole
    );

    return res.json(ApiResponse.success(user));
  } catch (error) {
    next(error);
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await userDomain.getUserStats();

    return res.json(ApiResponse.success(stats));
  } catch (error) {
    next(error);
  }
}
