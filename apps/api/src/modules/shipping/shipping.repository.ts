// apps/api/src/modules/shipping/shipping.repository.ts

import { query } from '../../infrastructure/database/client.js';
import type {
  ShippingZone,
  ShippingCarrier,
  ShippingRate,
  CreateShippingZoneInput,
  UpdateShippingZoneInput,
  CreateShippingCarrierInput,
  UpdateShippingCarrierInput,
  CreateShippingRateInput,
  UpdateShippingRateInput
} from './shipping.types.js';

// ============= SHIPPING ZONES =============

export async function findAllZones(params: {
  page: number;
  limit: number;
  is_active?: boolean;
}): Promise<{ zones: ShippingZone[]; total: number }> {
  const { page, limit, is_active } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['deleted_at IS NULL'];
  const params_array: any[] = [];
  let paramIndex = 1;

  if (is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex}`);
    params_array.push(is_active);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM shipping_zones WHERE ${whereClause}`,
    params_array
  );

  const total = parseInt(countResult.rows[0].count, 10);

  // Get zones
  const zonesResult = await query<any>(
    `SELECT * FROM shipping_zones
     WHERE ${whereClause}
     ORDER BY name ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params_array, limit, offset]
  );

  return {
    zones: zonesResult.rows as ShippingZone[],
    total
  };
}

export async function findZoneById(id: string): Promise<ShippingZone | null> {
  const result = await query<ShippingZone>(
    `SELECT * FROM shipping_zones WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return result.rows[0] || null;
}

export async function findZoneByPostcode(postcode: string): Promise<ShippingZone | null> {
  const result = await query<any>(
    `SELECT * FROM shipping_zones WHERE is_active = true AND deleted_at IS NULL`,
    []
  );

  // Find zone that includes this postcode
  for (const zone of result.rows) {
    // Check if postcode is excluded
    if (zone.excluded_postcodes && zone.excluded_postcodes.includes(postcode)) {
      continue;
    }

    // For now, simple match - could be improved with regex or ranges
    return zone as ShippingZone;
  }

  return null;
}

export async function createZone(data: CreateShippingZoneInput): Promise<ShippingZone> {
  const result = await query<ShippingZone>(
    `INSERT INTO shipping_zones (name, provinces, excluded_postcodes, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      data.name,
      JSON.stringify(data.provinces),
      JSON.stringify(data.excluded_postcodes || []),
      data.is_active ?? true
    ]
  );

  return result.rows[0];
}

export async function updateZone(
  id: string,
  data: UpdateShippingZoneInput
): Promise<ShippingZone | null> {
  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    params.push(data.name);
    paramIndex++;
  }

  if (data.provinces !== undefined) {
    updates.push(`provinces = $${paramIndex}`);
    params.push(JSON.stringify(data.provinces));
    paramIndex++;
  }

  if (data.excluded_postcodes !== undefined) {
    updates.push(`excluded_postcodes = $${paramIndex}`);
    params.push(JSON.stringify(data.excluded_postcodes));
    paramIndex++;
  }

  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    params.push(data.is_active);
    paramIndex++;
  }

  if (updates.length === 0) return null;

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const result = await query<ShippingZone>(
    `UPDATE shipping_zones
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

export async function deleteZone(id: string): Promise<boolean> {
  const result = await query(
    `UPDATE shipping_zones
     SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return (result.rowCount || 0) > 0;
}

// ============= SHIPPING CARRIERS =============

export async function findAllCarriers(params: {
  page: number;
  limit: number;
  is_active?: boolean;
}): Promise<{ carriers: ShippingCarrier[]; total: number }> {
  const { page, limit, is_active } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['deleted_at IS NULL'];
  const params_array: any[] = [];
  let paramIndex = 1;

  if (is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex}`);
    params_array.push(is_active);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM shipping_carriers WHERE ${whereClause}`,
    params_array
  );

  const total = parseInt(countResult.rows[0].count, 10);

  // Get carriers
  const carriersResult = await query<ShippingCarrier>(
    `SELECT * FROM shipping_carriers
     WHERE ${whereClause}
     ORDER BY name ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params_array, limit, offset]
  );

  return {
    carriers: carriersResult.rows,
    total
  };
}

export async function findCarrierById(id: string): Promise<ShippingCarrier | null> {
  const result = await query<ShippingCarrier>(
    `SELECT * FROM shipping_carriers WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return result.rows[0] || null;
}

export async function findCarrierByCode(code: string): Promise<ShippingCarrier | null> {
  const result = await query<ShippingCarrier>(
    `SELECT * FROM shipping_carriers WHERE code = $1 AND deleted_at IS NULL`,
    [code]
  );

  return result.rows[0] || null;
}

export async function createCarrier(data: CreateShippingCarrierInput): Promise<ShippingCarrier> {
  const result = await query<ShippingCarrier>(
    `INSERT INTO shipping_carriers (name, code, logo_url, is_active, config)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.name,
      data.code,
      data.logo_url || null,
      data.is_active ?? true,
      data.config ? JSON.stringify(data.config) : null
    ]
  );

  return result.rows[0];
}

export async function updateCarrier(
  id: string,
  data: UpdateShippingCarrierInput
): Promise<ShippingCarrier | null> {
  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    params.push(data.name);
    paramIndex++;
  }

  if (data.code !== undefined) {
    updates.push(`code = $${paramIndex}`);
    params.push(data.code);
    paramIndex++;
  }

  if (data.logo_url !== undefined) {
    updates.push(`logo_url = $${paramIndex}`);
    params.push(data.logo_url);
    paramIndex++;
  }

  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    params.push(data.is_active);
    paramIndex++;
  }

  if (data.config !== undefined) {
    updates.push(`config = $${paramIndex}`);
    params.push(JSON.stringify(data.config));
    paramIndex++;
  }

  if (updates.length === 0) return null;

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const result = await query<ShippingCarrier>(
    `UPDATE shipping_carriers
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

export async function deleteCarrier(id: string): Promise<boolean> {
  const result = await query(
    `UPDATE shipping_carriers
     SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return (result.rowCount || 0) > 0;
}

// ============= SHIPPING RATES =============

export async function findAllRates(params: {
  page: number;
  limit: number;
  zone_id?: string;
  carrier_id?: string;
  is_active?: boolean;
}): Promise<{ rates: ShippingRate[]; total: number }> {
  const { page, limit, zone_id, carrier_id, is_active } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['deleted_at IS NULL'];
  const params_array: any[] = [];
  let paramIndex = 1;

  if (zone_id) {
    conditions.push(`zone_id = $${paramIndex}`);
    params_array.push(zone_id);
    paramIndex++;
  }

  if (carrier_id) {
    conditions.push(`carrier_id = $${paramIndex}`);
    params_array.push(carrier_id);
    paramIndex++;
  }

  if (is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex}`);
    params_array.push(is_active);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM shipping_rates WHERE ${whereClause}`,
    params_array
  );

  const total = parseInt(countResult.rows[0].count, 10);

  // Get rates
  const ratesResult = await query<ShippingRate>(
    `SELECT * FROM shipping_rates
     WHERE ${whereClause}
     ORDER BY min_amount ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params_array, limit, offset]
  );

  return {
    rates: ratesResult.rows,
    total
  };
}

export async function findRateById(id: string): Promise<ShippingRate | null> {
  const result = await query<ShippingRate>(
    `SELECT * FROM shipping_rates WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return result.rows[0] || null;
}

export async function findRatesByZoneAndAmount(
  zoneId: string,
  amount: number
): Promise<ShippingRate[]> {
  const result = await query<ShippingRate>(
    `SELECT * FROM shipping_rates
     WHERE zone_id = $1
       AND is_active = true
       AND deleted_at IS NULL
       AND min_amount <= $2
       AND (max_amount IS NULL OR max_amount >= $2)
     ORDER BY price ASC`,
    [zoneId, amount]
  );

  return result.rows;
}

export async function createRate(data: CreateShippingRateInput): Promise<ShippingRate> {
  const result = await query<ShippingRate>(
    `INSERT INTO shipping_rates (
      zone_id, carrier_id, min_amount, max_amount, price,
      estimated_days_min, estimated_days_max, is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      data.zone_id,
      data.carrier_id,
      data.min_amount,
      data.max_amount || null,
      data.price,
      data.estimated_days_min,
      data.estimated_days_max,
      data.is_active ?? true
    ]
  );

  return result.rows[0];
}

export async function updateRate(
  id: string,
  data: UpdateShippingRateInput
): Promise<ShippingRate | null> {
  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (data.zone_id !== undefined) {
    updates.push(`zone_id = $${paramIndex}`);
    params.push(data.zone_id);
    paramIndex++;
  }

  if (data.carrier_id !== undefined) {
    updates.push(`carrier_id = $${paramIndex}`);
    params.push(data.carrier_id);
    paramIndex++;
  }

  if (data.min_amount !== undefined) {
    updates.push(`min_amount = $${paramIndex}`);
    params.push(data.min_amount);
    paramIndex++;
  }

  if (data.max_amount !== undefined) {
    updates.push(`max_amount = $${paramIndex}`);
    params.push(data.max_amount);
    paramIndex++;
  }

  if (data.price !== undefined) {
    updates.push(`price = $${paramIndex}`);
    params.push(data.price);
    paramIndex++;
  }

  if (data.estimated_days_min !== undefined) {
    updates.push(`estimated_days_min = $${paramIndex}`);
    params.push(data.estimated_days_min);
    paramIndex++;
  }

  if (data.estimated_days_max !== undefined) {
    updates.push(`estimated_days_max = $${paramIndex}`);
    params.push(data.estimated_days_max);
    paramIndex++;
  }

  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    params.push(data.is_active);
    paramIndex++;
  }

  if (updates.length === 0) return null;

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const result = await query<ShippingRate>(
    `UPDATE shipping_rates
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

export async function deleteRate(id: string): Promise<boolean> {
  const result = await query(
    `UPDATE shipping_rates
     SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  return (result.rowCount || 0) > 0;
}
