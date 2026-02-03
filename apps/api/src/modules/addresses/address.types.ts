// apps/api/src/modules/addresses/address.types.ts

export interface UserAddress {
  id: string;
  user_id: string;
  alias: string;
  street: string;
  street_number: string;
  floor: string | null;
  apartment: string | null;
  city: string;
  province: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateAddressInput {
  alias: string;
  street: string;
  street_number: string;
  floor?: string;
  apartment?: string;
  city: string;
  province: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
  place_id?: string;
  is_default?: boolean;
}

export interface UpdateAddressInput {
  alias?: string;
  street?: string;
  street_number?: string;
  floor?: string;
  apartment?: string;
  city?: string;
  province?: string;
  postcode?: string;
  latitude?: number;
  longitude?: number;
  place_id?: string;
  is_default?: boolean;
  is_active?: boolean;
}

export interface AddressFilters {
  user_id?: string;
  is_default?: boolean;
  is_active?: boolean;
  province?: string;
  city?: string;
  page?: number;
  limit?: number;
}
