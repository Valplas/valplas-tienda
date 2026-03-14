// apps/web/src/lib/services/users.service.ts

import { get, post, patch, del } from '../api';
import { UserRole } from '@/types';

export interface AdminUser {
  id: string;
  email: string | null;
  username: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GetAdminUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  is_active?: boolean;
  sort?: 'first_name' | 'created_at';
}

export async function getAdminUsers(params?: GetAdminUsersParams) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.role) query.set('role', params.role);
  if (params?.is_active !== undefined) query.set('is_active', String(params.is_active));
  if (params?.sort) query.set('sort', params.sort);

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
  first_name: string;
  last_name?: string;
  password: string;
  role: UserRole;
  phone: string;
  is_active?: boolean;
}

export async function createAdminUser(data: CreateAdminUserData): Promise<AdminUser> {
  const res = await post<AdminUser>('/users', data);
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'Error al crear usuario');
  return res.data;
}

export interface UpdateAdminUserData {
  email?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  role?: UserRole;
  phone?: string;
  is_active?: boolean;
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
