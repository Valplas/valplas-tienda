// apps/api/src/modules/addresses/address.domain.ts

import * as addressRepository from './address.repository.js';
import * as shippingRepository from '../shipping/shipping.repository.js';
import type {
  UserAddress,
  CreateAddressInput,
  UpdateAddressInput,
  AddressFilters
} from './address.types.js';

/**
 * Get user's addresses
 */
export async function getUserAddresses(userId: string, filters: Omit<AddressFilters, 'user_id'>) {
  return addressRepository.findAddresses({
    ...filters,
    user_id: userId
  });
}

/**
 * Get all addresses (admin only)
 */
export async function getAllAddresses(filters: AddressFilters) {
  return addressRepository.findAddresses(filters);
}

/**
 * Get address by ID
 */
export async function getAddressById(
  id: string,
  userId: string,
  isAdmin: boolean = false
): Promise<UserAddress> {
  const address = await addressRepository.findAddressById(id);

  if (!address) {
    throw new Error('Dirección no encontrada');
  }

  // Check ownership unless admin
  if (!isAdmin && address.user_id !== userId) {
    throw new Error('No tienes permiso para ver esta dirección');
  }

  return address;
}

/**
 * Get user's default address
 */
export async function getDefaultAddress(userId: string): Promise<UserAddress | null> {
  return addressRepository.findDefaultAddress(userId);
}

/**
 * Create address
 */
export async function createAddress(
  userId: string,
  data: CreateAddressInput
): Promise<UserAddress> {
  // Validate postcode has shipping coverage
  const zone = await shippingRepository.findZoneByPostcode(data.postcode);
  if (!zone) {
    throw new Error('No realizamos envíos a este código postal');
  }

  // If this is the first address, make it default
  const existingCount = await addressRepository.countUserAddresses(userId);
  const shouldBeDefault = existingCount === 0 ? true : data.is_default;

  return addressRepository.createAddress(userId, {
    ...data,
    is_default: shouldBeDefault
  });
}

/**
 * Update address
 */
export async function updateAddress(
  id: string,
  userId: string,
  data: UpdateAddressInput,
  isAdmin: boolean = false
): Promise<UserAddress> {
  const address = await addressRepository.findAddressById(id);

  if (!address) {
    throw new Error('Dirección no encontrada');
  }

  // Check ownership unless admin
  if (!isAdmin && address.user_id !== userId) {
    throw new Error('No tienes permiso para modificar esta dirección');
  }

  // Validate postcode has shipping coverage if changing
  if (data.postcode && data.postcode !== address.postcode) {
    const zone = await shippingRepository.findZoneByPostcode(data.postcode);
    if (!zone) {
      throw new Error('No realizamos envíos a este código postal');
    }
  }

  const updated = await addressRepository.updateAddress(id, address.user_id, data);

  if (!updated) {
    throw new Error('Error al actualizar dirección');
  }

  return updated;
}

/**
 * Delete address
 */
export async function deleteAddress(
  id: string,
  userId: string,
  isAdmin: boolean = false
): Promise<void> {
  const address = await addressRepository.findAddressById(id);

  if (!address) {
    throw new Error('Dirección no encontrada');
  }

  // Check ownership unless admin
  if (!isAdmin && address.user_id !== userId) {
    throw new Error('No tienes permiso para eliminar esta dirección');
  }

  // Don't allow deleting the only active address
  const activeCount = await addressRepository.countUserAddresses(address.user_id);
  if (activeCount === 1) {
    throw new Error('No puedes eliminar tu única dirección activa');
  }

  const deleted = await addressRepository.deleteAddress(id, address.user_id);

  if (!deleted) {
    throw new Error('Error al eliminar dirección');
  }

  // If deleted address was default, set another as default
  if (address.is_default) {
    const addresses = await addressRepository.findAddresses({
      user_id: address.user_id,
      is_active: true,
      limit: 1
    });

    if (addresses.addresses.length > 0) {
      await addressRepository.updateAddress(addresses.addresses[0].id, address.user_id, {
        is_default: true
      });
    }
  }
}

/**
 * Set address as default
 */
export async function setDefaultAddress(
  id: string,
  userId: string,
  isAdmin: boolean = false
): Promise<UserAddress> {
  const address = await addressRepository.findAddressById(id);

  if (!address) {
    throw new Error('Dirección no encontrada');
  }

  // Check ownership unless admin
  if (!isAdmin && address.user_id !== userId) {
    throw new Error('No tienes permiso para modificar esta dirección');
  }

  const updated = await addressRepository.updateAddress(id, address.user_id, {
    is_default: true,
    is_active: true
  });

  if (!updated) {
    throw new Error('Error al establecer dirección por defecto');
  }

  return updated;
}
