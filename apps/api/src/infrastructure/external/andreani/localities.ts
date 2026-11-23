// apps/api/src/infrastructure/external/andreani/localities.ts
//
// Resuelve el nombre de localidad que Andreani espera para un CP (cache 24 h por CP).

import { getAndreaniClient } from './index.js';

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; names: string[] }>();

export function clearLocalityCache(): void {
  cache.clear();
}

export function normalizePlaceName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function getNames(postcode: string): Promise<string[]> {
  const hit = cache.get(postcode);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.names;
  const localities = await getAndreaniClient().listLocalities(postcode);
  const names = [...new Set(localities.map((l) => l.localidad))];
  cache.set(postcode, { at: Date.now(), names });
  return names;
}

export async function resolveLocalidad(
  postcode: string,
  city: string
): Promise<{ localidad: string | null; candidates: string[] }> {
  const candidates = await getNames(postcode);
  const wanted = normalizePlaceName(city);
  const match = candidates.find((c) => normalizePlaceName(c) === wanted);
  if (match) return { localidad: match, candidates };
  if (candidates.length === 1) return { localidad: candidates[0], candidates };
  return { localidad: null, candidates };
}
