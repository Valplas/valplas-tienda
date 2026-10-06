import type { UserRole } from './user.types.js';

/** Dominio de los emails placeholder que genera tools/migration/src/migrate-clients.ts */
export const PLACEHOLDER_EMAIL_DOMAIN = '@sinmail.local';

/** Fila de users necesaria para resolver un merge. Nunca incluye password_hash. */
export interface MergeCandidate {
  id: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  google_id: string | null;
  first_name: string;
  last_name: string | null;
  role: UserRole;
  is_legacy: boolean;
  last_login_at: Date | null;
  email_verified: boolean;
  has_password: boolean;
  created_at: Date;
}

export interface MergedIdentity {
  email: string | null;
  username: string | null;
  phone: string | null;
  google_id: string | null;
  email_verified: boolean;
  last_login_at: Date | null;
  has_password: boolean;
}

export interface DiscardedField {
  field: 'email' | 'username' | 'phone';
  value: string;
}

export interface MergeResolution {
  /** true: el password_hash del target se reemplaza por el de la source (aunque sea NULL) */
  take_source_password: boolean;
  identity: MergedIdentity;
  discarded: DiscardedField[];
}

export interface MergeUserSummary {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  is_legacy: boolean;
  has_google: boolean;
  created_at: Date;
  orders_count: number;
  addresses_count: number;
}

export interface MergePreview {
  target: MergeUserSummary;
  source: MergeUserSummary;
  result: {
    email: string | null;
    username: string | null;
    phone: string | null;
    email_verified: boolean;
    has_password: boolean;
    has_google: boolean;
  };
  discarded: DiscardedField[];
}

export interface MergeResult {
  target_id: string;
  source_id: string;
  moved: { orders: number; addresses: number; status_history: number };
  discarded: DiscardedField[];
}

export interface MergeSuggestion {
  user: {
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    has_google: boolean;
    created_at: Date;
  };
  legacy_user: {
    id: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    orders_count: number;
  };
  confidence: 'high' | 'medium';
  matched_address: { street: string; street_number: string; city: string };
}
