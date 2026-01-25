/**
 * Fake User Service - Usuarios y direcciones mock
 * Simula operaciones de perfil y direcciones con localStorage
 */

import { ApiResponse } from '@/lib/api';
import { User, Address } from '@/types';
import { fakeFetch } from '../utils/fake-fetch';
import { getOrInit, setItem } from '../utils/local-storage';
import { MOCK_USERS, MOCK_ADDRESSES } from '../data';

const STORAGE_KEY_USERS = 'users';
const STORAGE_KEY_ADDRESSES = 'addresses';

/**
 * Inicializa datos
 */
function initUsers(): User[] {
  return getOrInit(STORAGE_KEY_USERS, MOCK_USERS);
}

function initAddresses(): Address[] {
  return getOrInit(STORAGE_KEY_ADDRESSES, MOCK_ADDRESSES);
}

/**
 * Guardar datos
 */
function saveUsers(users: User[]): void {
  setItem(STORAGE_KEY_USERS, users);
}

function saveAddresses(addresses: Address[]): void {
  setItem(STORAGE_KEY_ADDRESSES, addresses);
}

// ============================================================================
// USERS
// ============================================================================

/**
 * Obtener usuario por ID
 */
export async function fake_getUserById(id: string): Promise<ApiResponse<User>> {
  return fakeFetch(() => {
    const users = initUsers();
    const user = users.find((u) => u.id === id);

    if (!user) {
      return {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Usuario no encontrado'
        }
      };
    }

    return {
      success: true,
      data: user
    };
  });
}

/**
 * Actualizar perfil de usuario
 */
export async function fake_updateProfile(
  userId: string,
  updates: Partial<Pick<User, 'first_name' | 'last_name' | 'phone'>>
): Promise<ApiResponse<User>> {
  return fakeFetch(() => {
    const users = initUsers();
    const index = users.findIndex((u) => u.id === userId);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Usuario no encontrado'
        }
      };
    }

    const updatedUser: User = {
      ...users[index],
      ...updates,
      updated_at: new Date().toISOString()
    };

    users[index] = updatedUser;
    saveUsers(users);

    return {
      success: true,
      data: updatedUser
    };
  });
}

// ============================================================================
// ADDRESSES
// ============================================================================

/**
 * Obtener direcciones de un usuario
 */
export async function fake_getUserAddresses(userId: string): Promise<ApiResponse<Address[]>> {
  return fakeFetch(() => {
    const addresses = initAddresses();
    const userAddresses = addresses.filter((a) => a.user_id === userId);

    return {
      success: true,
      data: userAddresses
    };
  });
}

/**
 * Obtener dirección por ID
 */
export async function fake_getAddressById(id: string): Promise<ApiResponse<Address>> {
  return fakeFetch(() => {
    const addresses = initAddresses();
    const address = addresses.find((a) => a.id === id);

    if (!address) {
      return {
        success: false,
        error: {
          code: 'ADDRESS_NOT_FOUND',
          message: 'Dirección no encontrada'
        }
      };
    }

    return {
      success: true,
      data: address
    };
  });
}

/**
 * Crear nueva dirección
 */
export async function fake_createAddress(
  addressData: Omit<Address, 'id' | 'created_at' | 'updated_at'>
): Promise<ApiResponse<Address>> {
  return fakeFetch(() => {
    const addresses = initAddresses();

    // Si es_default, desmarcar otras direcciones del mismo usuario
    if (addressData.is_default) {
      addresses.forEach((addr) => {
        if (addr.user_id === addressData.user_id) {
          addr.is_default = false;
        }
      });
    }

    const newAddress: Address = {
      ...addressData,
      id: `addr-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    addresses.push(newAddress);
    saveAddresses(addresses);

    return {
      success: true,
      data: newAddress
    };
  });
}

/**
 * Actualizar dirección
 */
export async function fake_updateAddress(
  id: string,
  updates: Partial<Address>
): Promise<ApiResponse<Address>> {
  return fakeFetch(() => {
    const addresses = initAddresses();
    const index = addresses.findIndex((a) => a.id === id);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'ADDRESS_NOT_FOUND',
          message: 'Dirección no encontrada'
        }
      };
    }

    // Si se marca como default, desmarcar otras
    if (updates.is_default) {
      const userId = addresses[index].user_id;
      addresses.forEach((addr) => {
        if (addr.user_id === userId && addr.id !== id) {
          addr.is_default = false;
        }
      });
    }

    const updatedAddress: Address = {
      ...addresses[index],
      ...updates,
      id, // Mantener ID original
      updated_at: new Date().toISOString()
    };

    addresses[index] = updatedAddress;
    saveAddresses(addresses);

    return {
      success: true,
      data: updatedAddress
    };
  });
}

/**
 * Eliminar dirección
 */
export async function fake_deleteAddress(id: string): Promise<ApiResponse<void>> {
  return fakeFetch(() => {
    const addresses = initAddresses();
    const index = addresses.findIndex((a) => a.id === id);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'ADDRESS_NOT_FOUND',
          message: 'Dirección no encontrada'
        }
      };
    }

    addresses.splice(index, 1);
    saveAddresses(addresses);

    return {
      success: true
    };
  });
}

/**
 * Establecer dirección como predeterminada
 */
export async function fake_setDefaultAddress(id: string): Promise<ApiResponse<Address>> {
  return fakeFetch(() => {
    const addresses = initAddresses();
    const index = addresses.findIndex((a) => a.id === id);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: 'ADDRESS_NOT_FOUND',
          message: 'Dirección no encontrada'
        }
      };
    }

    const userId = addresses[index].user_id;

    // Desmarcar todas las direcciones del usuario
    addresses.forEach((addr) => {
      if (addr.user_id === userId) {
        addr.is_default = false;
      }
    });

    // Marcar la dirección seleccionada
    addresses[index].is_default = true;
    addresses[index].updated_at = new Date().toISOString();

    saveAddresses(addresses);

    return {
      success: true,
      data: addresses[index]
    };
  });
}
