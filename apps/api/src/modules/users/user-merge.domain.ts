// apps/api/src/modules/users/user-merge.domain.ts

import { transaction } from '../../infrastructure/database/client.js';
import { logger } from '../../infrastructure/logger/index.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import * as mergeRepository from './user-merge.repository.js';
import { resolveMergedIdentity } from './user-merge.identity.js';
import type {
  MergeCandidate,
  MergePreview,
  MergeResult,
  MergeUserSummary
} from './user-merge.types.js';

function assertMergeable(
  targetId: string,
  sourceId: string,
  candidates: MergeCandidate[]
): { target: MergeCandidate; source: MergeCandidate } {
  if (targetId === sourceId) {
    throw new AppError('SAME_USER', 'No se puede fusionar una cuenta consigo misma', 400);
  }
  const target = candidates.find((c) => c.id === targetId);
  const source = candidates.find((c) => c.id === sourceId);
  if (!target || !source) {
    throw new AppError('USER_NOT_FOUND', 'Alguna de las cuentas no existe o ya fue fusionada', 404);
  }
  if (target.role !== 'customer' || source.role !== 'customer') {
    throw new AppError(
      'MERGE_ROLE_NOT_ALLOWED',
      'Solo se pueden fusionar cuentas de clientes',
      400
    );
  }
  return { target, source };
}

function toSummary(
  c: MergeCandidate,
  counts: { orders: number; addresses: number }
): MergeUserSummary {
  return {
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    username: c.username,
    phone: c.phone,
    is_legacy: c.is_legacy,
    has_google: !!c.google_id,
    created_at: c.created_at,
    orders_count: counts.orders,
    addresses_count: counts.addresses
  };
}

export async function previewMerge(targetId: string, sourceId: string): Promise<MergePreview> {
  const candidates = await mergeRepository.findMergeCandidates([targetId, sourceId]);
  const { target, source } = assertMergeable(targetId, sourceId, candidates);
  const { identity, discarded } = resolveMergedIdentity(target, source);
  const [targetCounts, sourceCounts] = await Promise.all([
    mergeRepository.countMovableRows(targetId),
    mergeRepository.countMovableRows(sourceId)
  ]);

  return {
    target: toSummary(target, targetCounts),
    source: toSummary(source, sourceCounts),
    result: {
      email: identity.email,
      username: identity.username,
      phone: identity.phone,
      email_verified: identity.email_verified,
      has_password: identity.has_password,
      has_google: !!identity.google_id
    },
    discarded
  };
}

export async function mergeUsers(
  targetId: string,
  sourceId: string,
  adminId: string
): Promise<MergeResult> {
  const result = await transaction(async (client) => {
    const candidates = await mergeRepository.findMergeCandidates(
      [targetId, sourceId],
      client,
      true
    );
    const { target, source } = assertMergeable(targetId, sourceId, candidates);
    const resolution = resolveMergedIdentity(target, source);
    const moved = await mergeRepository.applyMerge(client, targetId, sourceId, resolution);
    return { target_id: targetId, source_id: sourceId, moved, discarded: resolution.discarded };
  });

  logger.info(`User merge: ${sourceId} → ${targetId} (admin ${adminId})`, { moved: result.moved });
  return result;
}
