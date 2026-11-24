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
    /** Alguna zona de envío activa cubre el CP */
    isDeliverable?: boolean;
  }[];
}

export interface GetAdminUsersParams {
  /** Sin page se pagina por cursor; con page, OFFSET clásico. */
  page?: number;
  cursor?: string;
  limit?: number;
  search?: string;
  role?: string;
  isActive?: boolean;
  sort?: 'firstName' | 'createdAt';
  includeAddresses?: boolean;
  contactStatus?: 'missing';
}

export async function getAdminUsers(params?: GetAdminUsersParams): Promise<{
  users: (AdminUser | AdminUserWithAddresses)[];
  total: number;
  totalPages: number;
  hasMore: boolean;
  nextCursor: string | null;
}> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.role) query.set('role', params.role);
  if (params?.isActive !== undefined) query.set('is_active', String(params.isActive));
  // El backend espera snake_case en los query params
  if (params?.sort) query.set('sort', params.sort === 'createdAt' ? 'created_at' : 'first_name');
  if (params?.includeAddresses) query.set('include_addresses', 'true');
  if (params?.contactStatus) query.set('contact_status', params.contactStatus);

  const qs = query.toString();
  const res = await get<AdminUser[]>(`/users${qs ? `?${qs}` : ''}`);
  if (!res.success || !res.data) {
    return { users: [], total: 0, totalPages: 0, hasMore: false, nextCursor: null };
  }
  const pagination = res.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  return {
    users: res.data,
    total: pagination?.total ?? res.data.length,
    totalPages,
    // Por cursor el servidor informa hasMore; con page se deduce del total de páginas
    hasMore: pagination?.hasMore ?? (pagination?.page ?? 1) < totalPages,
    nextCursor: pagination?.cursor ?? null
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
  const res = await post<AdminUser>('/users', {
    email: data.email,
    username: data.username,
    password: data.password,
    phone: data.phone,
    first_name: data.firstName,
    last_name: data.lastName,
    role: data.role,
    is_active: data.isActive
  });
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
  const res = await patch<AdminUser>(`/users/${id}`, {
    email: data.email,
    username: data.username,
    phone: data.phone,
    first_name: data.firstName,
    last_name: data.lastName,
    role: data.role,
    is_active: data.isActive
  });
  if (!res.success || !res.data)
    throw new Error(res.error?.message ?? 'Error al actualizar usuario');
  return res.data;
}

export async function deleteAdminUser(id: string): Promise<void> {
  const res = await del<{ message: string }>(`/users/${id}`);
  if (!res.success) throw new Error(res.error?.message ?? 'Error al eliminar usuario');
}
