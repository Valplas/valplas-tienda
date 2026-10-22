import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import type { NextRequest } from 'next/server';
import { REVALIDATABLE_TAGS, type CacheTag } from '@/lib/cache-tags';

/**
 * POST /api/revalidate — lo llama la API (Railway) al cambiar banners o el
 * logo, con el secreto compartido REVALIDATE_SECRET. Solo invalida tags del
 * allowlist; la próxima visita recarga los datos (invalidate-only).
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  const provided = request.headers.get('x-revalidate-secret');
  if (!secret || !provided) return false;

  const expected = Buffer.from(secret);
  const received = Buffer.from(provided);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function isCacheTag(value: unknown): value is CacheTag {
  return typeof value === 'string' && (REVALIDATABLE_TAGS as readonly string[]).includes(value);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ revalidated: false, message: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags) ? body.tags.filter(isCacheTag) : [];
  if (tags.length === 0) {
    return Response.json({ revalidated: false, message: 'No valid tags' }, { status: 400 });
  }

  // { expire: 0 }: expiración inmediata, recomendada para webhooks externos
  // (con 'max' la primera visita todavía vería el contenido viejo).
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }

  return Response.json({ revalidated: true, tags });
}
