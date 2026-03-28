// apps/web/src/lib/services/addresses.service.ts

import { get, post, patch, del } from '../api';
import type { ApiResponse } from '../api';

export interface Address {
  id: string;
  userId: string;
  alias: string;
  street: string;
  streetNumber: string;
  floor: string | null;
  apartment: string | null;
  city: string;
  province: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAddressInput {
  alias: string;
  street: string;
  streetNumber: string;
  floor?: string;
  apartment?: string;
  city: string;
  province: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  notes?: string;
  isDefault?: boolean;
}

export interface UpdateAddressInput {
  alias?: string;
  street?: string;
  streetNumber?: string;
  floor?: string;
  apartment?: string;
  city?: string;
  province?: string;
  postcode?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  notes?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

/**
 * Get current user's addresses
 */
export async function getUserAddresses(): Promise<ApiResponse<Address[]>> {
  return get<Address[]>('/addresses/me');
}

/**
 * Get current user's default address
 */
export async function getDefaultAddress(): Promise<Address> {
  const response = await get<Address>('/addresses/me/default');

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al obtener dirección predeterminada');
}

/**
 * Create new address
 */
export async function createAddress(data: CreateAddressInput): Promise<Address> {
  const response = await post<Address>('/addresses', data);

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al crear dirección');
}

/**
 * Update address
 */
export async function updateAddress(id: string, data: UpdateAddressInput): Promise<Address> {
  const response = await patch<Address>(`/addresses/${id}`, data);

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al actualizar dirección');
}

/**
 * Delete address
 */
export async function deleteAddress(id: string): Promise<void> {
  const response = await del(`/addresses/${id}`);

  if (!response.success) {
    throw new Error(response.error?.message || 'Error al eliminar dirección');
  }
}

/**
 * Create address for a specific user (admin only)
 */
export async function adminCreateUserAddress(
  userId: string,
  data: CreateAddressInput
): Promise<Address> {
  const response = await post<Address>(`/addresses/admin/user/${userId}`, data);
  if (response.success && response.data) return response.data;
  throw new Error(response.error?.message || 'Error al crear dirección');
}

/**
 * Get addresses for a specific user (admin only)
 */
export async function getAdminUserAddresses(userId: string): Promise<Address[]> {
  const response = await get<Address[]>(`/addresses/admin/all?user_id=${userId}&limit=100`);
  return response.data ?? [];
}

/**
 * Set address as default
 */
export async function setDefaultAddress(id: string): Promise<Address> {
  const response = await post<Address>(`/addresses/${id}/set-default`, {});

  if (response.success && response.data) {
    return response.data;
  }

  throw new Error(response.error?.message || 'Error al establecer dirección predeterminada');
}
