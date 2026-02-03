// apps/api/src/modules/shipping/shipping.types.ts

export interface ShippingZone {
  id: string;
  name: string;
  provinces: string[];
  excluded_postcodes: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface ShippingCarrier {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  is_active: boolean;
  config: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface ShippingRate {
  id: string;
  zone_id: string;
  carrier_id: string;
  min_amount: number;
  max_amount: number | null;
  price: number;
  estimated_days_min: number;
  estimated_days_max: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface ShippingQuoteRequest {
  postcode: string;
  cart_total: number;
}

export interface ShippingQuote {
  carrier_id: string;
  carrier_name: string;
  carrier_logo: string | null;
  price: number;
  estimated_days: string;
  zone_name: string;
}

export interface CreateShippingZoneInput {
  name: string;
  provinces: string[];
  excluded_postcodes?: string[];
  is_active?: boolean;
}

export interface UpdateShippingZoneInput {
  name?: string;
  provinces?: string[];
  excluded_postcodes?: string[];
  is_active?: boolean;
}

export interface CreateShippingCarrierInput {
  name: string;
  code: string;
  logo_url?: string;
  is_active?: boolean;
  config?: Record<string, any>;
}

export interface UpdateShippingCarrierInput {
  name?: string;
  code?: string;
  logo_url?: string;
  is_active?: boolean;
  config?: Record<string, any>;
}

export interface CreateShippingRateInput {
  zone_id: string;
  carrier_id: string;
  min_amount: number;
  max_amount?: number;
  price: number;
  estimated_days_min: number;
  estimated_days_max: number;
  is_active?: boolean;
}

export interface UpdateShippingRateInput {
  zone_id?: string;
  carrier_id?: string;
  min_amount?: number;
  max_amount?: number;
  price?: number;
  estimated_days_min?: number;
  estimated_days_max?: number;
  is_active?: boolean;
}
