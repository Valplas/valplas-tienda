// apps/api/src/modules/addresses/address.domain.ts

import * as addressRepository from './address.repository.js';
import * as shippingRepository from '../shipping/shipping.repository.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import { noCoverageError } from '../shipping/shipping-coverage.js';
import type {
  UserAddress,
  CreateAddressInput,
  UpdateAddressInput,
  AddressFilters
} from './address.types.js';

const addressNotFound = () => new AppError('ADDRESS_NOT_FOUND', 'Dirección no encontrada', 404);

/** Una dirección solo se acepta si alguna zona activa cubre su código postal. */
async function assertPostcodeCovered(postcode: string): Promise<void> {
  const zone = await shippingRepository.findZoneByPostcode(postcode);
  if (!zone) throw await noCoverageError(postcode);
}

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
    throw addressNotFound();
  }

  // Check ownership unless admin
  if (!isAdmin && address.user_id !== userId) {
    throw new AppError('ADDRESS_FORBIDDEN', 'No tienes permiso para ver esta dirección', 403);
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
  await assertPostcodeCovered(data.postcode);

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
    throw addressNotFound();
  }

  // Check ownership unless admin
  if (!isAdmin && address.user_id !== userId) {
    throw new AppError('ADDRESS_FORBIDDEN', 'No tienes permiso para modificar esta dirección', 403);
  }

  // Validate postcode has shipping coverage if changing
  if (data.postcode && data.postcode !== address.postcode) {
    await assertPostcodeCovered(data.postcode);
  }

  const updated = await addressRepository.updateAddress(id, address.user_id, data);

  if (!updated) {
    throw new AppError('ADDRESS_UPDATE_FAILED', 'Error al actualizar dirección', 500);
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
    throw addressNotFound();
  }

  // Check ownership unless admin
  if (!isAdmin && address.user_id !== userId) {
    throw new AppError('ADDRESS_FORBIDDEN', 'No tienes permiso para eliminar esta dirección', 403);
  }

  // Don't allow deleting the only active address
  const activeCount = await addressRepository.countUserAddresses(address.user_id);
  if (activeCount === 1) {
    throw new AppError('LAST_ACTIVE_ADDRESS', 'No puedes eliminar tu única dirección activa', 400);
  }

  const deleted = await addressRepository.deleteAddress(id, address.user_id);

  if (!deleted) {
    throw new AppError('ADDRESS_DELETE_FAILED', 'Error al eliminar dirección', 500);
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
    throw addressNotFound();
  }

  // Check ownership unless admin
  if (!isAdmin && address.user_id !== userId) {
    throw new AppError('ADDRESS_FORBIDDEN', 'No tienes permiso para modificar esta dirección', 403);
  }

  const updated = await addressRepository.updateAddress(id, address.user_id, {
    is_default: true,
    is_active: true
  });

  if (!updated) {
    throw new AppError('ADDRESS_UPDATE_FAILED', 'Error al establecer dirección por defecto', 500);
  }

  return updated;
}
