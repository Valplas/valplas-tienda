// apps/api/src/modules/shipments/andreani-webhook.controller.ts
//
// Webhook opcional "Novedades PUSH" de Andreani. Deshabilitado salvo que ANDREANI_PUSH_USERNAME
// y ANDREANI_PUSH_PASSWORD estén configurados. La respuesta sigue el contrato de Andreani
// ({ message, error, status }), por eso NO usa ApiResponseBuilder. Andreani trata 200/201/202
// como éxito, reintenta ante 5xx (cada 5 min, hasta 3 veces) y no reintenta otros códigos.

import { timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { getAndreaniConfig } from '../../infrastructure/external/andreani/config.js';
import { logger } from '../../infrastructure/logger/index.js';
import { pushToEventInput, type AndreaniPushPayload } from './event-mapping.js';
import { ingestEvents } from './shipment-ingest.js';
import * as shipmentRepository from './shipment.repository.js';

type PushResponse = { message: string; error: string; status: 'OK' | 'ERROR' };

/**
 * Compara en tiempo constante. Ambos lados se copian a buffers del mismo largo (timingSafeEqual
 * exige largos iguales) y la igualdad de largo se chequea después, sin cortocircuitar antes de
 * comparar el contenido.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  const len = Math.max(bufA.length, bufB.length, 1);
  const padA = Buffer.alloc(len);
  const padB = Buffer.alloc(len);
  bufA.copy(padA);
  bufB.copy(padB);
  const sameContent = timingSafeEqual(padA, padB);
  return sameContent && bufA.length === bufB.length;
}

const NO_CREDENTIALS = { user: '', pass: '' };

/** Parsea `Authorization: Basic <base64>` sin regex sobre el header completo (evita ReDoS). */
function parseBasicAuth(header: string | undefined): { user: string; pass: string } {
  const value = (header ?? '').trim();
  const sep = value.search(/\s/);
  if (sep < 0 || value.slice(0, sep).toLowerCase() !== 'basic') return NO_CREDENTIALS;
  const decoded = Buffer.from(value.slice(sep + 1).trim(), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  return idx < 0 ? NO_CREDENTIALS : { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
}

const reply = (res: Response, http: number, body: PushResponse): void => {
  res.status(http).json(body);
};

const badPayload = (res: Response, error: string): void =>
  reply(res, 200, { message: '', error, status: 'ERROR' });

export async function handleAndreaniPush(req: Request, res: Response): Promise<void> {
  const { username, password } = getAndreaniConfig().push;

  if (!username || !password) {
    // Deshabilitado: que parezca que la ruta no existe
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Ruta no encontrada: ${req.method} ${req.path}` }
    });
    return;
  }

  const { user, pass } = parseBasicAuth(req.headers.authorization);
  // Sin cortocircuito: se evalúan ambas comparaciones siempre
  const userOk = safeEqual(user, username);
  const passOk = safeEqual(pass, password);
  if (!(userOk && passOk)) {
    reply(res, 401, { message: '', error: 'No autorizado', status: 'ERROR' });
    return;
  }

  const body = (req.body ?? {}) as Partial<AndreaniPushPayload>;
  if (!body.NumeroDeEnvio || !body.Estado || !body.FechaEstado) {
    badPayload(res, 'Faltan campos obligatorios: NumeroDeEnvio, Estado, FechaEstado');
    return;
  }

  try {
    let event;
    try {
      event = pushToEventInput(body as AndreaniPushPayload);
    } catch {
      badPayload(res, 'FechaEstado inválida');
      return;
    }

    const shipment = await shipmentRepository.findByTrackingNumber(body.NumeroDeEnvio);
    if (!shipment) {
      logger.warn('Andreani push: envío desconocido', { trackingNumber: body.NumeroDeEnvio });
      badPayload(res, 'Envío desconocido');
      return;
    }

    await ingestEvents(shipment.id, [event], 'push');
    reply(res, 200, { message: 'Novedad registrada', error: '', status: 'OK' });
  } catch (error) {
    // 5xx para que Andreani reintente
    logger.error('Andreani push: error interno', {
      trackingNumber: body.NumeroDeEnvio,
      error: error instanceof Error ? error.message : String(error)
    });
    reply(res, 500, { message: '', error: 'Error interno', status: 'ERROR' });
  }
}
