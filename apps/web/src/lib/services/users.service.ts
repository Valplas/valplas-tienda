// apps/web/src/lib/services/users.service.ts

import { get, post, patch, del } from '../api';
import { UserRole } from '@/types';

export interface AdminUser {
  id: string;
  email: string | null;
  username: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AdminUserWithAddresses extends AdminUser {
  addresses: {
    id: string;
    alias: string;
    street: string;
    streetNumber: string;
    floor: string | null;
    apartment: string | null;
    city: string;
    province: string;
    postcode: string;
    isDefault: boolean;
    isActive: boolean;
  }[];
}

export interface GetAdminUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  isActive?: boolean;
  sort?: 'firstName' | 'createdAt';
  includeAddresses?: boolean;
}

export async function getAdminUsers(
  params?: GetAdminUsersParams
): Promise<{ users: (AdminUser | AdminUserWithAddresses)[]; total: number; totalPages: number }> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.role) query.set('role', params.role);
  if (params?.isActive !== undefined) query.set('is_active', String(params.isActive));
  if (params?.sort) query.set('sort', params.sort);
  if (params?.includeAddresses) query.set('include_addresses', 'true');

  const qs = query.toString();
  const res = await get<AdminUser[]>(`/users${qs ? `?${qs}` : ''}`);
  if (!res.success || !res.data) return { users: [], total: 0, totalPages: 0 };
  return {
    users: res.data,
    total: res.pagination?.total ?? res.data.length,
    totalPages: res.pagination?.totalPages ?? 1
  };
}

export interface CreateAdminUserData {
  email?: string;
  username?: string;
  firstName: string;
  lastName?: string;
  password: string;
  role: UserRole;
  phone: string;
  isActive?: boolean;
}

export async function createAdminUser(data: CreateAdminUserData): Promise<AdminUser> {
  const res = await post<AdminUser>('/users', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear usuario');
  return res.data;
}

export interface UpdateAdminUserData {
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  phone?: string;
  isActive?: boolean;
}

export async function updateAdminUser(id: string, data: UpdateAdminUserData): Promise<AdminUser> {
  const res = await patch<AdminUser>(`/users/${id}`, data);
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar usuario');
  return res.data;
}

export async function deleteAdminUser(id: string): Promise<void> {
  const res = await del<{ message: string }>(`/users/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar usuario');
}
