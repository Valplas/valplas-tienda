// Cálculo de bultos y elección de contrato. Funciones puras: sin DB ni lectura de env.

import { AppError } from '../../shared/middleware/error.middleware.js';
import type { AndreaniConfig } from '../../infrastructure/external/andreani/config.js';
import type {
  PackageLine,
  ServiceType,
  ShipmentChannel,
  ShipmentPackage
} from './shipment.types.js';

export const MAX_B2C_KG = 50;
export const MAX_BULTOS = 300;

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round2 = (n: number): number => Math.round(n * 100) / 100;

export function channelFor(packages: ShipmentPackage[]): ShipmentChannel {
  const totalKg = packages.reduce((sum, p) => sum + p.kilos, 0);
  return packages.length > 1 || totalKg > MAX_B2C_KG ? 'B2B' : 'B2C';
}

export function computePackages(
  lines: PackageLine[],
  subtotal: number,
  defaults: { itemWeightKg: number; itemVolumeCm3: number }
): {
  packages: ShipmentPackage[];
  totalKg: number;
  totalVolumeCm3: number;
  channel: ShipmentChannel;
  warnings: string[];
} {
  if (lines.length === 0) {
    throw new AppError('SHIPMENT_NO_ITEMS', 'El pedido no tiene productos para enviar', 422);
  }

  const warnings: string[] = [];
  let totalKg = 0;
  let totalVolume = 0;

  for (const l of lines) {
    if (l.weightKg == null) {
      warnings.push(`"${l.productName}" no tiene peso cargado; se usó ${defaults.itemWeightKg} kg`);
    }
    const hasDims = l.widthCm != null && l.lengthCm != null && l.heightCm != null;
    if (!hasDims) {
      warnings.push(
        `"${l.productName}" no tiene medidas completas; se usó ${defaults.itemVolumeCm3} cm3`
      );
    }
    const unitKg = l.weightKg ?? defaults.itemWeightKg;
    const unitVolume = hasDims
      ? (l.lengthCm as number) * (l.widthCm as number) * (l.heightCm as number)
      : defaults.itemVolumeCm3;
    totalKg += unitKg * l.realQuantity;
    totalVolume += unitVolume * l.realQuantity;
  }

  totalKg = round3(totalKg);
  totalVolume = Math.round(totalVolume);

  const count = Math.max(1, Math.ceil(totalKg / MAX_B2C_KG));
  if (count > MAX_BULTOS) {
    throw new AppError(
      'ANDREANI_TOO_MANY_BULTOS',
      `El envío requiere ${count} bultos y el máximo es ${MAX_BULTOS}`,
      422,
      { bultos: count }
    );
  }

  const kilos = round3(totalKg / count);
  const volumeCm3 = Math.round(totalVolume / count);
  const baseValue = round2(subtotal / count);
  const packages: ShipmentPackage[] = [];
  let allocated = 0;
  for (let i = 0; i < count; i++) {
    // El último bulto absorbe el resto del redondeo para que la suma dé el subtotal.
    const declaredValue = i === count - 1 ? round2(subtotal - allocated) : baseValue;
    allocated = round2(allocated + declaredValue);
    packages.push({ kilos, volumeCm3, declaredValue });
  }

  return {
    packages,
    totalKg,
    totalVolumeCm3: totalVolume,
    channel: channelFor(packages),
    warnings
  };
}

export function pickContract(
  serviceType: ServiceType,
  channel: ShipmentChannel,
  contracts: AndreaniConfig['contracts']
): string {
  if (channel === 'B2B') {
    if (serviceType === 'branch_pickup') {
      throw new AppError(
        'ANDREANI_B2B_BRANCH_UNSUPPORTED',
        'Los pedidos de más de 50 kg no se pueden enviar a sucursal',
        422
      );
    }
    if (!contracts.b2b) {
      throw new AppError(
        'ANDREANI_B2B_NOT_CONFIGURED',
        'No hay contrato Andreani B2B configurado para envíos de más de 50 kg',
        422
      );
    }
    return contracts.b2b;
  }
  if (serviceType === 'branch_pickup') {
    if (!contracts.branch) {
      throw new AppError(
        'ANDREANI_BRANCH_NOT_CONFIGURED',
        'No hay contrato Andreani de retiro en sucursal configurado',
        422
      );
    }
    return contracts.branch;
  }
  return contracts.home;
}
