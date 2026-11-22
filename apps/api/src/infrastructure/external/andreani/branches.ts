// apps/api/src/infrastructure/external/andreani/branches.ts
//
// Sucursales de Andreani para retiro: lista cacheada 12 h, filtro por CP atendido.

import { getAndreaniClient } from './index.js';
import type { AndreaniBranch } from './types.js';

export interface BranchSnapshot {
  id: string;
  number: string;
  code: string;
  name: string;
  address: string;
  postcode: string;
  city: string;
  province: string;
  hours: string | null;
}

const TTL_MS = 12 * 60 * 60 * 1000;
let cache: { at: number; list: AndreaniBranch[] } | null = null;

export function clearBranchCache(): void {
  cache = null;
}

async function getBranches(): Promise<AndreaniBranch[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
  const list = await getAndreaniClient().listBranches();
  cache = { at: Date.now(), list };
  return list;
}

export function toBranchSnapshot(b: AndreaniBranch): BranchSnapshot {
  const d = b.direccion ?? {};
  return {
    id: String(b.id),
    number: b.numero != null ? String(b.numero) : '',
    code: b.codigo ?? '',
    name: (b.descripcion ?? '').trim(),
    address: [d.calle?.trim(), d.numero?.trim()].filter(Boolean).join(' '),
    postcode: d.codigoPostal?.trim() ?? '',
    city: d.localidad?.trim() ?? '',
    province: d.provincia?.trim() ?? '',
    hours: b.horarioDeAtencion?.trim() || null
  };
}

function canDeliver(b: AndreaniBranch): boolean {
  return (
    b.canal !== 'B2B' &&
    b.datosAdicionales?.entregaEnvios !== false &&
    b.datosAdicionales?.seHaceAtencionAlCliente !== false
  );
}

/** Primer bloque de 4 digitos (soporta CPA como C1406ABC). */
function numericPostcode(cp: string): number | null {
  const m = /\d{4}/.exec(cp);
  return m ? Number.parseInt(m[0], 10) : null;
}

export async function findPickupBranches(postcode: string, limit = 10): Promise<BranchSnapshot[]> {
  const eligible = (await getBranches()).filter(canDeliver);
  const serving = eligible.filter((b) => b.codigosPostalesAtendidos?.includes(postcode));
  if (serving.length > 0) return serving.slice(0, limit).map(toBranchSnapshot);

  const target = numericPostcode(postcode);
  if (target === null) return [];
  const distance = (b: AndreaniBranch): number => {
    const cp = numericPostcode(b.direccion?.codigoPostal ?? '');
    return cp === null ? Number.POSITIVE_INFINITY : Math.abs(cp - target);
  };
  return [...eligible]
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, limit)
    .map(toBranchSnapshot);
}

export async function findBranchById(id: string): Promise<BranchSnapshot | null> {
  const found = (await getBranches()).find((b) => String(b.id) === id);
  return found ? toBranchSnapshot(found) : null;
}
