// Mapea un envío de Valplas al request de POST /v2/ordenes-de-envio de Andreani. Función pura.

import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { AndreaniConfig } from '../../infrastructure/external/andreani/config.js';
import type { BranchSnapshot } from '../../infrastructure/external/andreani/branches.js';
import type {
  AndreaniAddress,
  AndreaniCreateOrderRequest,
  AndreaniParcel,
  AndreaniPerson
} from '../../infrastructure/external/andreani/types.js';
import type { ServiceType, ShipmentChannel, ShipmentPackage } from './shipment.types.js';

export interface CreateOrderRequestContext {
  shipmentId: string;
  orderNumber: string;
  contract: string;
  channel: ShipmentChannel;
  serviceType: ServiceType;
  originBranchId: string;
  sender: AndreaniConfig['sender'];
  recipient: {
    fullName: string;
    email: string | null;
    phone: string | null;
    document: string | null;
  };
  address: {
    street: string;
    number: string;
    floor: string | null;
    apartment: string | null;
    postcode: string;
    localidad: string;
  } | null;
  destinationBranch: BranchSnapshot | null;
  packages: ShipmentPackage[];
}

const MAX_NAME = 40;

/** Número nacional argentino (solo dígitos, sin el 9 de móvil) o null si no es un número AR válido. */
export function toAndreaniPhone(e164: string | null): string | null {
  if (!e164) return null;
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed || parsed.country !== 'AR') return null;
  let national = String(parsed.nationalNumber).replace(/\D/g, '');
  if (national.length === 11 && national.startsWith('9')) national = national.slice(1);
  return national.length > 0 && national.length <= 15 ? national : null;
}

/** Últimos 12 dígitos del número de pedido (rellenado con 0 a la izquierda) + 'R'. */
export function remitoNumberFor(orderNumber: string): string {
  const digits = orderNumber.replace(/\D/g, '').slice(-12);
  return `${digits.padStart(12, '0')}R`;
}

function buildDestination(ctx: CreateOrderRequestContext): AndreaniAddress {
  if (ctx.serviceType === 'branch_pickup') {
    if (!ctx.destinationBranch) {
      throw new Error('destinationBranch is required for branch_pickup');
    }
    // TODO(smoke): confirm sucursal.id vs numero
    return { sucursal: { id: ctx.destinationBranch.id } };
  }
  if (!ctx.address) {
    throw new Error('address is required for home_delivery');
  }
  const a = ctx.address;
  return {
    postal: {
      codigoPostal: a.postcode,
      calle: a.street,
      numero: a.number,
      ...(a.floor ? { piso: a.floor } : {}),
      ...(a.apartment ? { departamento: a.apartment } : {}),
      localidad: a.localidad
    }
  };
}

export function buildCreateOrderRequest(
  ctx: CreateOrderRequestContext
): AndreaniCreateOrderRequest {
  // TODO(smoke): confirm phone type codes (spec tables disagree)
  const senderPhone = ctx.sender.phone.replace(/\D/g, '');
  const remitente: AndreaniPerson = {
    nombreCompleto: ctx.sender.name.slice(0, MAX_NAME),
    email: ctx.sender.email,
    ...(ctx.sender.docNumber
      ? { documentoTipo: ctx.sender.docType, documentoNumero: ctx.sender.docNumber }
      : {}),
    ...(senderPhone ? { telefonos: [{ tipo: 1, numero: senderPhone }] } : {})
  };

  const recipientPhone = toAndreaniPhone(ctx.recipient.phone);
  const destinatario: AndreaniPerson = {
    nombreCompleto: ctx.recipient.fullName.slice(0, MAX_NAME),
    email: ctx.recipient.email ?? ctx.sender.email,
    ...(ctx.recipient.document
      ? { documentoTipo: 'DNI', documentoNumero: ctx.recipient.document }
      : {}),
    ...(recipientPhone ? { telefonos: [{ tipo: 2, numero: recipientPhone }] } : {})
  };

  const bultos: AndreaniParcel[] = ctx.packages.map((p) => ({
    kilos: p.kilos,
    volumenCm: p.volumeCm3,
    ...(p.largoCm != null ? { largoCm: p.largoCm } : {}),
    ...(p.anchoCm != null ? { anchoCm: p.anchoCm } : {}),
    ...(p.altoCm != null ? { altoCm: p.altoCm } : {}),
    valorDeclaradoSinImpuestos: p.declaredValue,
    referencias: [{ meta: 'idCliente', contenido: ctx.orderNumber }]
  }));

  return {
    contrato: ctx.contract,
    idPedido: ctx.shipmentId,
    // TODO(smoke): confirm sucursal.id vs numero
    origen: { sucursal: { id: ctx.originBranchId } },
    destino: buildDestination(ctx),
    remitente,
    destinatario: [destinatario],
    ...(ctx.channel === 'B2B'
      ? { remito: { numeroRemito: remitoNumberFor(ctx.orderNumber) } }
      : {}),
    bultos
  };
}
