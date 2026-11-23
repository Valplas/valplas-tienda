// apps/api/src/modules/shipments/shipment.domain.ts
//
// Envíos Andreani desde el backoffice: preview, alta (pre-envío + etiqueta), cancelación,
// etiqueta y sucursales. El ciclo de vida posterior vive en shipment-lifecycle.ts.

import { query, transaction } from '../../infrastructure/database/client.js';
import { AppError } from '../../shared/middleware/error.middleware.js';
import {
  getAndreaniClient,
  isAndreaniEnabled
} from '../../infrastructure/external/andreani/index.js';
import { getAndreaniConfig } from '../../infrastructure/external/andreani/config.js';
import { AndreaniError, isRetryable } from '../../infrastructure/external/andreani/errors.js';
import {
  findBranchById,
  findPickupBranches,
  type BranchSnapshot
} from '../../infrastructure/external/andreani/branches.js';
import { resolveLocalidad } from '../../infrastructure/external/andreani/localities.js';
import { findOrderById, revertOrderToProcessing } from '../orders/order.repository.js';
import type { Order } from '../orders/order.types.js';
import { channelFor, computePackages, pickContract } from './packages.js';
import { buildCreateOrderRequest } from './request-mapper.js';
import * as shipmentRepository from './shipment.repository.js';
import {
  andreaniDisabledError,
  andreaniUnavailableError,
  applyCreateResult,
  handleCreateFailure
} from './shipment-lifecycle.js';
import type { ServiceType, Shipment, ShipmentChannel, ShipmentPackage } from './shipment.types.js';
import { toAdminShipment, type AdminShipmentView } from './shipment.view.js';

export { applyCreateResult, pollShipment, refreshShipment } from './shipment-lifecycle.js';

const CREATABLE_ORDER_STATUSES = ['payment_confirmed', 'processing', 'ready_to_ship'];
const CANCELLABLE_STATUSES = ['pending', 'created'];
const DISCARD_MESSAGE = 'Descartado manualmente por un administrador';
const NO_LABEL_STATUSES = ['requesting', 'error', 'rejected', 'cancelled', 'expired'];

export interface ShipmentRecipient {
  fullName: string;
  email: string | null;
  phone: string | null;
  document: string | null;
}

export interface ShipmentPreview {
  serviceType: ServiceType;
  destinationBranch: BranchSnapshot | null;
  packages: ShipmentPackage[];
  totalKg: number;
  totalVolumeCm3: number;
  channel: ShipmentChannel;
  contract: string | null;
  contractError: string | null;
  localidad: { resolved: string | null; candidates: string[] };
  recipient: ShipmentRecipient;
  warnings: string[];
  canCreate: boolean;
  blockReason: string | null;
}

export interface CreateShipmentInput {
  serviceType: ServiceType;
  branchId?: string;
  packages?: (Omit<ShipmentPackage, 'declaredValue'> & { declaredValue?: number })[];
  localidad?: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface OrderAddress {
  street: string;
  number: string;
  floor: string | null;
  apartment: string | null;
  city: string;
  postcode: string;
}

/** Dirección del pedido, o null si falta algún dato obligatorio (pedidos sin dirección). */
function orderAddress(o: Order): OrderAddress | null {
  const street = (o.shipping_street ?? '').trim();
  const number = (o.shipping_street_number ?? '').trim();
  const city = (o.shipping_city ?? '').trim();
  const postcode = (o.shipping_postcode ?? '').trim();
  if (!street || !number || !city || !postcode) return null;
  return {
    street,
    number,
    floor: o.shipping_floor?.trim() || null,
    apartment: o.shipping_apartment?.trim() || null,
    city,
    postcode
  };
}

async function loadRecipient(o: Order): Promise<ShipmentRecipient> {
  const r = await query<{
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  }>('SELECT first_name, last_name, email, phone FROM users WHERE id = $1', [o.user_id]);
  const u = r.rows[0];
  const fullName = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return {
    fullName: fullName || 'Cliente Valplas',
    email: u?.email ?? null,
    phone: u?.phone ?? null,
    document: o.recipient_document ?? null
  };
}

async function loadOrder(orderId: string): Promise<Order> {
  const order = await findOrderById(orderId);
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Pedido no encontrado', 404);
  return order;
}

/** Ejecuta una consulta a Andreani traduciendo sus errores a AppError. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AndreaniError) throw andreaniUnavailableError(e);
    throw e;
  }
}

function branchFromOrder(o: Order): BranchSnapshot | null {
  const b = o.pickup_branch as Partial<BranchSnapshot> | null;
  return b && typeof b.id === 'string' ? (b as BranchSnapshot) : null;
}

export async function previewForOrder(
  orderId: string,
  opts: { serviceType?: ServiceType; branchId?: string } = {}
): Promise<ShipmentPreview> {
  const order = await loadOrder(orderId);
  const cfg = getAndreaniConfig();
  const enabled = isAndreaniEnabled();
  const serviceType = opts.serviceType ?? order.shipping_method;
  const recipient = await loadRecipient(order);
  const reasons: string[] = [];

  if (!enabled) reasons.push('La integración con Andreani está deshabilitada');
  if (!CREATABLE_ORDER_STATUSES.includes(order.status)) {
    reasons.push('El pedido no está listo para generar el envío (falta confirmar el pago)');
  }
  const existing = await shipmentRepository.findBlockingByOrderId(orderId);
  if (existing) reasons.push('El pedido ya tiene un envío activo con Andreani');

  let packages: ShipmentPackage[] = [];
  let totalKg = 0;
  let totalVolumeCm3 = 0;
  let channel: ShipmentChannel = 'B2C';
  let warnings: string[] = [];
  try {
    const lines = await shipmentRepository.findPackageLinesForOrder(orderId);
    const computed = computePackages(lines, Number(order.subtotal), cfg.defaults);
    ({ packages, totalKg, totalVolumeCm3, channel, warnings } = computed);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    reasons.push(e.message);
  }

  let contract: string | null = null;
  let contractError: string | null = null;
  if (packages.length > 0) {
    try {
      contract = pickContract(serviceType, channel, cfg.contracts) || null;
      if (!contract) contractError = 'No hay contrato Andreani configurado para este envío';
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      contractError = e.message;
    }
    if (contractError) reasons.push(contractError);
  }

  let destinationBranch: BranchSnapshot | null = null;
  const localidad: ShipmentPreview['localidad'] = { resolved: null, candidates: [] };
  if (serviceType === 'branch_pickup') {
    const snapshot = branchFromOrder(order);
    const branchId = opts.branchId ?? snapshot?.id;
    if (!branchId) {
      reasons.push('Elegí una sucursal Andreani');
    } else {
      destinationBranch =
        snapshot?.id === branchId
          ? snapshot
          : enabled
            ? await guarded(() => findBranchById(branchId))
            : null;
      if (!destinationBranch && enabled) {
        reasons.push('La sucursal de Andreani elegida no existe o no admite entregas');
      }
    }
  } else {
    const address = orderAddress(order);
    if (!address) {
      reasons.push('El pedido no tiene dirección de entrega: elegí retiro en sucursal Andreani');
    } else if (enabled) {
      try {
        const r = await resolveLocalidad(address.postcode, address.city);
        localidad.resolved = r.localidad;
        localidad.candidates = r.candidates;
        if (!r.localidad) warnings.push('No se pudo determinar la localidad; elegila manualmente');
      } catch (e) {
        if (!(e instanceof AndreaniError)) throw e;
        warnings.push('No se pudo consultar las localidades de Andreani');
      }
    }
  }

  return {
    serviceType,
    destinationBranch,
    packages,
    totalKg,
    totalVolumeCm3,
    channel,
    contract,
    contractError,
    localidad,
    recipient,
    warnings,
    canCreate: reasons.length === 0,
    blockReason: reasons[0] ?? null
  };
}

function withDeclaredValues(
  input: NonNullable<CreateShipmentInput['packages']>,
  subtotal: number
): ShipmentPackage[] {
  const base = round2(subtotal / input.length);
  let allocated = 0;
  return input.map((p, i) => {
    const declaredValue =
      p.declaredValue ?? (i === input.length - 1 ? round2(subtotal - allocated) : base);
    allocated = round2(allocated + declaredValue);
    return { ...p, declaredValue };
  });
}

export async function createForOrder(
  orderId: string,
  input: CreateShipmentInput,
  actorId: string | null
): Promise<Shipment> {
  const order = await loadOrder(orderId);
  if (!CREATABLE_ORDER_STATUSES.includes(order.status)) {
    throw new AppError(
      'SHIPMENT_ORDER_NOT_READY',
      'El pedido debe tener el pago confirmado para generar el envío',
      409
    );
  }
  if (!isAndreaniEnabled()) throw andreaniDisabledError();
  const cfg = getAndreaniConfig();
  const { serviceType } = input;

  // Destino
  let destinationBranch: BranchSnapshot | null = null;
  let address: ReturnType<typeof orderAddress> = null;
  let localidad: string | null = null;
  if (serviceType === 'branch_pickup') {
    const branchId = input.branchId ?? branchFromOrder(order)?.id;
    destinationBranch = branchId ? await guarded(() => findBranchById(branchId)) : null;
    if (!destinationBranch) {
      throw new AppError(
        'SHIPMENT_BRANCH_INVALID',
        'La sucursal de Andreani elegida no existe o no admite entregas',
        422
      );
    }
  } else {
    address = orderAddress(order);
    if (!address) {
      throw new AppError(
        'ORDER_ADDRESS_REQUIRED',
        'El pedido no tiene dirección de entrega para un envío a domicilio',
        422
      );
    }
    localidad = input.localidad ?? null;
    if (!localidad) {
      const { postcode, city } = address;
      const r = await guarded(() => resolveLocalidad(postcode, city));
      if (!r.localidad) {
        throw new AppError(
          'SHIPMENT_LOCALIDAD_REQUIRED',
          'No se pudo determinar la localidad de Andreani para el código postal; elegila manualmente',
          422,
          r.candidates
        );
      }
      localidad = r.localidad;
    }
  }

  // Bultos y contrato
  const subtotal = Number(order.subtotal);
  const packages = input.packages
    ? withDeclaredValues(input.packages, subtotal)
    : computePackages(
        await shipmentRepository.findPackageLinesForOrder(orderId),
        subtotal,
        cfg.defaults
      ).packages;
  const channel = channelFor(packages);
  const contract = pickContract(serviceType, channel, cfg.contracts);
  if (!contract) {
    throw new AppError(
      'ANDREANI_CONTRACT_NOT_CONFIGURED',
      'No hay contrato Andreani configurado para este tipo de envío',
      422
    );
  }
  const recipient = await loadRecipient(order);

  // tx1: lock del pedido, fila 'requesting' y request_payload. Sin HTTP adentro.
  const shipment = await transaction(async (client) => {
    const locked = await client.query<{ status: string }>(
      'SELECT status FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );
    if (!locked.rows[0] || !CREATABLE_ORDER_STATUSES.includes(locked.rows[0].status)) {
      throw new AppError(
        'SHIPMENT_ORDER_NOT_READY',
        'El pedido ya no está en un estado válido para generar el envío',
        409
      );
    }
    const created = await shipmentRepository.insertRequesting(
      {
        orderId,
        serviceType,
        contract,
        channel,
        packages,
        destinationBranch,
        localidad,
        quotedPrice: null,
        createdBy: actorId
      },
      client
    );
    const payload = buildCreateOrderRequest({
      shipmentId: created.id,
      orderNumber: order.order_number,
      contract,
      channel,
      serviceType,
      originBranchId: cfg.originBranchId,
      sender: cfg.sender,
      recipient,
      address:
        address && localidad
          ? {
              street: address.street,
              number: address.number,
              floor: address.floor,
              apartment: address.apartment,
              postcode: address.postcode,
              localidad
            }
          : null,
      destinationBranch,
      packages
    });
    return shipmentRepository.updateShipment(
      created.id,
      // Lease: si el proceso muere antes de la respuesta, el job reenvía con el mismo idPedido.
      { request_payload: payload, next_poll_at: new Date(Date.now() + 5 * 60_000) },
      client
    );
  });

  // HTTP fuera de transacción
  let result;
  try {
    result = await getAndreaniClient().createOrder(
      shipment.request_payload as Parameters<ReturnType<typeof getAndreaniClient>['createOrder']>[0]
    );
  } catch (e) {
    const failure = await handleCreateFailure(shipment, e);
    if (failure.error) throw failure.error;
    return failure.shipment;
  }
  return applyCreateResult(shipment.id, result);
}

export async function cancelShipment(shipmentId: string): Promise<Shipment> {
  const s = await shipmentRepository.findById(shipmentId);
  if (!s) throw new AppError('SHIPMENT_NOT_FOUND', 'Envío no encontrado', 404);
  if (!CANCELLABLE_STATUSES.includes(s.status) || !s.tracking_number || !s.contract) {
    throw new AppError(
      'SHIPMENT_NOT_CANCELLABLE',
      'El envío ya no se puede cancelar (fue admitido o ya está cerrado)',
      409
    );
  }
  if (!isAndreaniEnabled()) throw andreaniDisabledError();

  try {
    await getAndreaniClient().cancelShipment({
      contract: s.contract,
      trackingNumber: s.tracking_number
    });
  } catch (e) {
    if (e instanceof AndreaniError && !isRetryable(e)) {
      throw new AppError(
        'SHIPMENT_NOT_CANCELLABLE',
        `Andreani no permite cancelar este envío: ${e.message}`,
        409
      );
    }
    if (e instanceof AndreaniError) throw andreaniUnavailableError(e);
    throw e;
  }

  return shipmentRepository.updateShipment(s.id, {
    status: 'cancelling',
    next_poll_at: new Date(Date.now() + 15 * 60_000),
    error_message: null
  });
}

/**
 * Descarta un envío trabado ('requesting' o 'cancelling') solo en la base local, sin llamar a
 * Andreani. Libera el pedido para poder regenerar el envío.
 */
export async function discardShipment(shipmentId: string): Promise<Shipment> {
  return transaction(async (client) => {
    const s = await shipmentRepository.findById(shipmentId, client, true);
    if (!s) throw new AppError('SHIPMENT_NOT_FOUND', 'Envío no encontrado', 404);
    if (s.status !== 'requesting' && s.status !== 'cancelling') {
      throw new AppError(
        'SHIPMENT_NOT_DISCARDABLE',
        'Solo se pueden descartar envíos trabados en "solicitando" o "cancelando"',
        409
      );
    }
    const updated = await shipmentRepository.updateShipment(
      s.id,
      {
        status: s.status === 'requesting' ? 'error' : 'cancelled',
        cancelled_at: s.status === 'cancelling' ? new Date() : undefined,
        error_message: DISCARD_MESSAGE,
        next_poll_at: null
      },
      client
    );
    await revertOrderToProcessing(
      client,
      s.order_id,
      'Envío Andreani descartado manualmente',
      s.tracking_number
    );
    return updated;
  });
}

/** Respuesta admin de un envío: con eventos y tracking_url, sin payloads crudos. */
export async function toAdminView(s: Shipment): Promise<AdminShipmentView> {
  return toAdminShipment({ ...s, events: await shipmentRepository.findEvents(s.id) });
}

/** Estado de la integración para el backoffice (sin secretos). */
export function getIntegrationConfig(): { enabled: boolean; mode: string; autoCreate: boolean } {
  const cfg = getAndreaniConfig();
  return { enabled: isAndreaniEnabled(), mode: cfg.mode, autoCreate: cfg.autoCreate };
}

export async function getLabel(
  shipmentId: string
): Promise<{ contentType: string; data: Buffer; filename: string }> {
  const s = await shipmentRepository.findById(shipmentId);
  if (!s) throw new AppError('SHIPMENT_NOT_FOUND', 'Envío no encontrado', 404);
  const id = s.group_number ?? s.tracking_number;
  if (NO_LABEL_STATUSES.includes(s.status) || !id) {
    throw new AppError(
      'SHIPMENT_LABEL_NOT_READY',
      'La etiqueta todavía no está disponible para este envío',
      409
    );
  }
  if (!isAndreaniEnabled()) throw andreaniDisabledError();
  const order = await loadOrder(s.order_id);
  const label = await guarded(() => getAndreaniClient().getLabel(id, 'pdf'));
  return {
    contentType: label.contentType,
    data: label.data,
    filename: `etiqueta-${order.order_number}.pdf`
  };
}

export async function listPickupBranches(
  postcode: string,
  limit: number
): Promise<BranchSnapshot[]> {
  if (!isAndreaniEnabled()) throw andreaniDisabledError();
  return guarded(() => findPickupBranches(postcode, limit));
}
