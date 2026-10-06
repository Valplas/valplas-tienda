// apps/web/src/lib/services/user-merge.service.ts

import { get, post } from '../api';

const PLACEHOLDER_EMAIL_DOMAIN = '@sinmail.local';

/** Los clientes migrados del CRM tienen un email placeholder: no mostrarlo como real. */
export function displayEmail(email: string | null): string {
  if (!email) return 'Sin email';
  return email.endsWith(PLACEHOLDER_EMAIL_DOMAIN) ? 'Sin email real' : email;
}

export interface MergeUserSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  isLegacy: boolean;
  hasGoogle: boolean;
  createdAt: string;
  ordersCount: number;
  addressesCount: number;
}

export interface DiscardedField {
  field: 'email' | 'username' | 'phone';
  value: string;
}

export interface MergePreview {
  target: MergeUserSummary;
  source: MergeUserSummary;
  result: {
    email: string | null;
    username: string | null;
    phone: string | null;
    emailVerified: boolean;
    hasPassword: boolean;
    hasGoogle: boolean;
  };
  discarded: DiscardedField[];
}

export interface MergeResult {
  targetId: string;
  sourceId: string;
  moved: { orders: number; addresses: number; statusHistory: number };
  discarded: DiscardedField[];
}

export interface MergeSuggestion {
  user: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    hasGoogle: boolean;
    createdAt: string;
  };
  legacyUser: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    ordersCount: number;
  };
  confidence: 'high' | 'medium';
  matchedAddress: { street: string; streetNumber: string; city: string };
}

export async function getMergePreview(targetId: string, sourceId: string): Promise<MergePreview> {
  const res = await get<MergePreview>(
    `/users/${targetId}/merge-preview?source_user_id=${encodeURIComponent(sourceId)}`
  );
  if (!res.success || !res.data) throw new Error('No se pudo cargar la vista previa');
  return res.data;
}

export async function mergeUsers(targetId: string, sourceId: string): Promise<MergeResult> {
  const res = await post<MergeResult>(`/users/${targetId}/merge`, { source_user_id: sourceId });
  if (!res.success || !res.data) throw new Error(res.error?.message ?? 'No se pudo fusionar');
  return res.data;
}

export async function getMergeSuggestions(
  page: number,
  limit: number
): Promise<{ suggestions: MergeSuggestion[]; total: number; hasMore: boolean }> {
  const res = await get<MergeSuggestion[]>(`/users/merge-suggestions?page=${page}&limit=${limit}`);
  if (!res.success || !res.data) return { suggestions: [], total: 0, hasMore: false };
  return {
    suggestions: res.data,
    total: res.pagination?.total ?? res.data.length,
    hasMore: res.pagination?.hasMore ?? false
  };
}

export async function dismissMergeSuggestion(userId: string, legacyUserId: string): Promise<void> {
  const res = await post<{ dismissed: boolean }>('/users/merge-suggestions/dismiss', {
    user_id: userId,
    legacy_user_id: legacyUserId
  });
  if (!res.success) throw new Error(res.error?.message ?? 'No se pudo descartar');
}
