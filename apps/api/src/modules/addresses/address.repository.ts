// apps/api/src/modules/addresses/address.repository.ts

import { query, transaction } from '../../infrastructure/database/client.js';
import type {
  UserAddress,
  CreateAddressInput,
  UpdateAddressInput,
  AddressFilters
} from './address.types.js';

/**
 * Find addresses with filters and pagination
 */
export async function findAddresses(
  filters: AddressFilters
): Promise<{ addresses: UserAddress[]; total: number }> {
  const { user_id, is_default, is_active, province, city, page = 1, limit = 20 } = filters;

  const offset = (page - 1) * limit;
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (user_id) {
    conditions.push(`user_id = $${paramIndex}`);
    params.push(user_id);
    paramIndex++;
  }

  if (is_default !== undefined) {
    conditions.push(`is_default = $${paramIndex}`);
    params.push(is_default);
    paramIndex++;
  }

  if (is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex}`);
    params.push(is_active);
    paramIndex++;
  }

  if (province) {
    conditions.push(`province = $${paramIndex}`);
    params.push(province);
    paramIndex++;
  }

  if (city) {
    conditions.push(`city ILIKE $${paramIndex}`);
    params.push(`%${city}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM user_addresses WHERE ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].count, 10);

  // Get addresses
  const addressesResult = await query<UserAddress>(
    `SELECT * FROM user_addresses
     WHERE ${whereClause}
     ORDER BY is_default DESC, created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return {
    addresses: addressesResult.rows,
    total
  };
}

/**
 * Find address by ID
 */
export async function findAddressById(id: string): Promise<UserAddress | null> {
  const result = await query<UserAddress>(
    'SELECT * FROM user_addresses WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Find user's default address
 */
export async function findDefaultAddress(userId: string): Promise<UserAddress | null> {
  const result = await query<UserAddress>(
    `SELECT * FROM user_addresses
     WHERE user_id = $1 AND is_default = true AND is_active = true AND deleted_at IS NULL
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

/**
 * Create address
 */
export async function createAddress(
  userId: string,
  data: CreateAddressInput
): Promise<UserAddress> {
  return transaction(async (client) => {
    // If this is set as default, unset other defaults
    if (data.is_default) {
      await client.query(
        `UPDATE user_addresses
         SET is_default = false
         WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId]
      );
    }

    // Insert new address
    const result = await client.query<UserAddress>(
      `INSERT INTO user_addresses (
        user_id, alias, street, street_number, floor, apartment,
        city, province, postcode, latitude, longitude, place_id, is_default, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        userId,
        data.alias,
        data.street,
        data.street_number,
        data.floor || null,
        data.apartment || null,
        data.city,
        data.province,
        data.postcode,
        data.latitude || null,
        data.longitude || null,
        data.place_id || null,
        data.is_default ?? false,
        true
      ]
    );

    return result.rows[0];
  });
}

/**
 * Update address
 */
export async function updateAddress(
  id: string,
  userId: string,
  data: UpdateAddressInput
): Promise<UserAddress | null> {
  return transaction(async (client) => {
    // If setting as default, unset other defaults
    if (data.is_default === true) {
      await client.query(
        `UPDATE user_addresses
         SET is_default = false
         WHERE user_id = $1 AND id != $2 AND deleted_at IS NULL`,
        [userId, id]
      );
    }

    // Build update query
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.alias !== undefined) {
      updates.push(`alias = $${paramIndex}`);
      params.push(data.alias);
      paramIndex++;
    }

    if (data.street !== undefined) {
      updates.push(`street = $${paramIndex}`);
      params.push(data.street);
      paramIndex++;
    }

    if (data.street_number !== undefined) {
      updates.push(`street_number = $${paramIndex}`);
      params.push(data.street_number);
      paramIndex++;
    }

    if (data.floor !== undefined) {
      updates.push(`floor = $${paramIndex}`);
      params.push(data.floor);
      paramIndex++;
    }

    if (data.apartment !== undefined) {
      updates.push(`apartment = $${paramIndex}`);
      params.push(data.apartment);
      paramIndex++;
    }

    if (data.city !== undefined) {
      updates.push(`city = $${paramIndex}`);
      params.push(data.city);
      paramIndex++;
    }

    if (data.province !== undefined) {
      updates.push(`province = $${paramIndex}`);
      params.push(data.province);
      paramIndex++;
    }

    if (data.postcode !== undefined) {
      updates.push(`postcode = $${paramIndex}`);
      params.push(data.postcode);
      paramIndex++;
    }

    if (data.latitude !== undefined) {
      updates.push(`latitude = $${paramIndex}`);
      params.push(data.latitude);
      paramIndex++;
    }

    if (data.longitude !== undefined) {
      updates.push(`longitude = $${paramIndex}`);
      params.push(data.longitude);
      paramIndex++;
    }

    if (data.place_id !== undefined) {
      updates.push(`place_id = $${paramIndex}`);
      params.push(data.place_id);
      paramIndex++;
    }

    if (data.is_default !== undefined) {
      updates.push(`is_default = $${paramIndex}`);
      params.push(data.is_default);
      paramIndex++;
    }

    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(data.is_active);
      paramIndex++;
    }

    if (updates.length === 0) return null;

    updates.push('updated_at = NOW()');
    params.push(id, userId);

    const result = await client.query<UserAddress>(
      `UPDATE user_addresses
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} AND deleted_at IS NULL
       RETURNING *`,
      params
    );

    return result.rows[0] || null;
  });
}

/**
 * Soft delete address
 */
export async function deleteAddress(id: string, userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE user_addresses
     SET deleted_at = NOW()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );

  return (result.rowCount || 0) > 0;
}

/**
 * Count user addresses
 */
export async function countUserAddresses(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM user_addresses
     WHERE user_id = $1 AND is_active = true AND deleted_at IS NULL`,
    [userId]
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Check if address belongs to user
 */
export async function isAddressOwnedByUser(addressId: string, userId: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM user_addresses
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [addressId, userId]
  );

  return parseInt(result.rows[0].count, 10) > 0;
}
