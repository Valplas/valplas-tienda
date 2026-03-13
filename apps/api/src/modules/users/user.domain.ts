// apps/api/src/modules/users/user.domain.ts

import * as userRepository from './user.repository.js';
import { hashPassword } from '../auth/auth.service.js';
import { ROLE_HIERARCHY } from './user.types.js';
import type {
  User,
  UserWithStats,
  CreateUserInput,
  UpdateUserInput,
  UpdateUserPasswordInput,
  UserFilters,
  UserRole,
  UserStats
} from './user.types.js';

/**
 * Check if requester has permission to manage target user
 */
function canManageUser(requesterRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_HIERARCHY[requesterRole] > ROLE_HIERARCHY[targetRole];
}

/**
 * Check if requester can create user with given role
 */
function canCreateRole(requesterRole: UserRole, targetRole: UserRole): boolean {
  // Owner can create anyone
  if (requesterRole === 'owner') return true;

  // Admin can create driver and customer
  if (requesterRole === 'admin' && ['driver', 'customer'].includes(targetRole)) {
    return true;
  }

  return false;
}

/**
 * Get all users (admin/owner only)
 */
export async function getAllUsers(filters: UserFilters) {
  return userRepository.findUsers(filters);
}

/**
 * Get user by ID
 */
export async function getUserById(
  id: string,
  requesterId: string,
  requesterRole: UserRole
): Promise<User> {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  // Owner and admin can see anyone
  // Others can only see themselves
  if (!['owner', 'admin'].includes(requesterRole) && user.id !== requesterId) {
    throw new Error('No tienes permiso para ver este usuario');
  }

  return user;
}

/**
 * Get user with statistics
 */
export async function getUserWithStats(
  id: string,
  requesterId: string,
  requesterRole: UserRole
): Promise<UserWithStats> {
  const user = await userRepository.findUserWithStats(id);

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  // Owner and admin can see anyone
  // Others can only see themselves
  if (!['owner', 'admin'].includes(requesterRole) && user.id !== requesterId) {
    throw new Error('No tienes permiso para ver este usuario');
  }

  return user;
}

/**
 * Create user (admin only)
 */
export async function createUser(data: CreateUserInput, requesterRole: UserRole): Promise<User> {
  // Check if requester can create this role
  if (!canCreateRole(requesterRole, data.role)) {
    throw new Error(`No tienes permiso para crear usuarios con rol ${data.role}`);
  }

  // Check email uniqueness only if provided
  if (data.email) {
    const existingEmail = await userRepository.findUserByEmail(data.email);
    if (existingEmail) {
      throw new Error('El email ya está en uso');
    }
  }

  // Resolve username: use provided or auto-generate from phone digits
  let resolvedUsername = data.username || '';
  if (!resolvedUsername) {
    const phoneDigits = data.phone.replace(/\D/g, '');
    resolvedUsername = phoneDigits;
    const existing = await userRepository.findUserByUsername(resolvedUsername);
    if (existing) {
      resolvedUsername = `${phoneDigits}_${Date.now().toString(36)}`;
    }
  } else {
    const existingUsername = await userRepository.findUserByUsername(resolvedUsername);
    if (existingUsername) {
      throw new Error('El nombre de usuario ya está en uso');
    }
  }

  // Hash password
  const passwordHash = await hashPassword(data.password);

  // Create user
  return userRepository.createUser({ ...data, username: resolvedUsername }, passwordHash);
}

/**
 * Update user
 */
export async function updateUser(
  id: string,
  data: UpdateUserInput,
  requesterId: string,
  requesterRole: UserRole
): Promise<User> {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  // Check if requester can manage this user
  if (!canManageUser(requesterRole, user.role) && user.id !== requesterId) {
    throw new Error('No tienes permiso para modificar este usuario');
  }

  // If changing role, check permission
  if (data.role && data.role !== user.role) {
    // Can't change your own role
    if (user.id === requesterId) {
      throw new Error('No puedes cambiar tu propio rol');
    }

    // Check if requester can manage target role
    if (!canManageUser(requesterRole, user.role)) {
      throw new Error('No tienes permiso para modificar el rol de este usuario');
    }

    // Check if requester can create the new role
    if (!canCreateRole(requesterRole, data.role)) {
      throw new Error(`No tienes permiso para asignar el rol ${data.role}`);
    }
  }

  // If changing email, check it's not in use
  if (data.email && data.email !== user.email) {
    const existingEmail = await userRepository.findUserByEmail(data.email);
    if (existingEmail) {
      throw new Error('El email ya está en uso');
    }
  }

  // If changing username, check it's not in use
  if (data.username && data.username !== user.username) {
    const existingUsername = await userRepository.findUserByUsername(data.username);
    if (existingUsername) {
      throw new Error('El nombre de usuario ya está en uso');
    }
  }

  const updated = await userRepository.updateUser(id, data);

  if (!updated) {
    throw new Error('Error al actualizar usuario');
  }

  return updated;
}

/**
 * Update user password (admin can reset anyone's password)
 */
export async function updateUserPassword(
  id: string,
  data: UpdateUserPasswordInput,
  requesterId: string,
  requesterRole: UserRole
): Promise<void> {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  // Check permission
  if (!canManageUser(requesterRole, user.role) && user.id !== requesterId) {
    throw new Error('No tienes permiso para cambiar la contraseña de este usuario');
  }

  // Hash new password
  const passwordHash = await hashPassword(data.new_password);

  // Update password
  const updated = await userRepository.updateUserPassword(id, passwordHash);

  if (!updated) {
    throw new Error('Error al actualizar contraseña');
  }
}

/**
 * Delete user (soft delete)
 */
export async function deleteUser(
  id: string,
  requesterId: string,
  requesterRole: UserRole
): Promise<void> {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  // Can't delete yourself
  if (user.id === requesterId) {
    throw new Error('No puedes eliminar tu propia cuenta');
  }

  // Check permission
  if (!canManageUser(requesterRole, user.role)) {
    throw new Error('No tienes permiso para eliminar este usuario');
  }

  const deleted = await userRepository.deleteUser(id);

  if (!deleted) {
    throw new Error('Error al eliminar usuario');
  }
}

/**
 * Activate/deactivate user
 */
export async function toggleUserActive(
  id: string,
  isActive: boolean,
  requesterId: string,
  requesterRole: UserRole
): Promise<User> {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  // Can't deactivate yourself
  if (user.id === requesterId && !isActive) {
    throw new Error('No puedes desactivar tu propia cuenta');
  }

  // Check permission
  if (!canManageUser(requesterRole, user.role)) {
    throw new Error('No tienes permiso para modificar este usuario');
  }

  const updated = await userRepository.updateUser(id, { is_active: isActive });

  if (!updated) {
    throw new Error('Error al actualizar usuario');
  }

  return updated;
}

/**
 * Get user statistics
 */
export async function getUserStats(): Promise<UserStats> {
  return userRepository.getUserStats();
}
