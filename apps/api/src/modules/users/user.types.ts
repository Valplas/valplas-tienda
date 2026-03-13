// apps/api/src/modules/users/user.types.ts

export type UserRole = 'owner' | 'admin' | 'driver' | 'customer';

export interface User {
  id: string;
  email: string | null;
  username: string;
  phone: string | null;
  first_name: string;
  last_name: string | null;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface UserWithStats extends User {
  total_orders: number;
  total_addresses: number;
  last_order_date: Date | null;
}

export interface CreateUserInput {
  email?: string;
  username?: string;
  password: string;
  phone: string;
  first_name: string;
  last_name?: string;
  role: UserRole;
  is_active?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  username?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  role?: UserRole;
  is_active?: boolean;
  email_verified?: boolean;
  phone_verified?: boolean;
}

export interface UpdateUserPasswordInput {
  new_password: string;
}

export interface UserFilters {
  role?: UserRole;
  is_active?: boolean;
  email_verified?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UserStats {
  total_users: number;
  by_role: {
    owner: number;
    admin: number;
    driver: number;
    customer: number;
  };
  active_users: number;
  verified_emails: number;
}

// Role hierarchy (higher number = more power)
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  driver: 2,
  customer: 1
};

// Role labels in Spanish
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  driver: 'Chofer',
  customer: 'Cliente'
};
